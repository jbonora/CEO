import Anthropic from "@anthropic-ai/sdk";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const { nombreEmpresa, urlSitio, emailCliente } = JSON.parse(event.body);
    
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const pbUrl = process.env.POCKETBASE_URL;
    const pbEmail = process.env.POCKETBASE_ADMIN_EMAIL;
    const pbPassword = process.env.POCKETBASE_ADMIN_PASSWORD;

    // 1. Autenticar en PocketBase
    const authRes = await fetch(`${pbUrl}/api/collections/_superusers/auth-with-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: pbEmail, password: pbPassword }),
    });
    const authData = await authRes.json();
    const pbToken = authData.token;
    const pbHeaders = {
      "Content-Type": "application/json",
      "Authorization": pbToken,
    };

    // 2. Intentar obtener contenido del sitio web
    let sitioContent = "";
    if (urlSitio) {
      try {
        const siteRes = await fetch(urlSitio, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; CEOVirtual/1.0)" },
        });
        if (siteRes.ok) {
          const html = await siteRes.text();
          // Extraer texto básico (quitar tags HTML)
          sitioContent = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .substring(0, 8000); // Limitar tokens
        }
      } catch (e) {
        console.log("No se pudo obtener el sitio web:", e.message);
      }
    }

    // 3. Claude investiga
    const client = new Anthropic({ apiKey: anthropicKey });

    const researchPrompt = `Sos un CEO que acaba de ser contratado para la empresa "${nombreEmpresa}".
${urlSitio ? `Su sitio web es: ${urlSitio}` : "No tienen sitio web público."}

${sitioContent ? `Contenido extraído del sitio web:
---
${sitioContent}
---` : ""}

Tu tarea: Investigar y extraer toda la información posible sobre esta empresa.

Responde SOLO con JSON válido (sin markdown):
{
  "nombre": "${nombreEmpresa}",
  "rubro": "rubro detectado o null",
  "descripcion": "descripción breve de qué hacen",
  "productos_servicios": "lista de productos/servicios detectados",
  "ubicacion": "ubicación si la encontrás",
  "antiguedad": "desde cuándo operan si lo encontrás",
  "datos_interesantes": ["dato 1", "dato 2"],
  "posibles_competidores": ["competidor 1", "competidor 2"],
  "preguntas_clave": ["pregunta que necesitás hacer", "otra pregunta"],
  "saludo_personalizado": "Un saludo de 2-3 oraciones presentándote como CEO, mencionando algo específico que encontraste sobre la empresa que demuestre que investigaste. Sé cálido pero profesional.",
  "nivel_conocimiento": {
    "rubro": "conocido|parcial|desconocido",
    "productos": "conocido|parcial|desconocido",
    "clientes": "conocido|parcial|desconocido",
    "tamano": "conocido|parcial|desconocido",
    "finanzas": "desconocido"
  }
}`; 

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: researchPrompt }],
    });

    const responseText = message.content[0].text;
    const cleanJson = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const research = JSON.parse(cleanJson);

    // 4. Guardar empresa en PocketBase
    const empresaRes = await fetch(`${pbUrl}/api/collections/empresas/records`, {
      method: "POST",
      headers: pbHeaders,
      body: JSON.stringify({
        nombre: research.nombre,
        rubro: research.rubro,
        descripcion: research.descripcion,
        productos_servicios: research.productos_servicios,
        onboarding_completo: false,
      }),
    });
    const empresa = await empresaRes.json();

    // 5. Guardar hechos encontrados
    for (const dato of research.datos_interesantes || []) {
      await fetch(`${pbUrl}/api/collections/hechos/records`, {
        method: "POST",
        headers: pbHeaders,
        body: JSON.stringify({
          empresa_id: empresa.id,
          categoria: "otro",
          hecho: dato,
          fuente: urlSitio || "investigación inicial",
          relevancia: "media",
          vigente: true,
        }),
      });
    }

    // 6. Inicializar mapa de conocimiento
    const temasBase = [
      { tema: "nombre_empresa", categoria: "general", nivel: "critico", pregunta: "¿Cuál es el nombre completo de la empresa?" },
      { tema: "rubro", categoria: "general", nivel: "critico", pregunta: "¿A qué rubro se dedican?" },
      { tema: "productos_servicios", categoria: "general", nivel: "critico", pregunta: "¿Qué productos o servicios ofrecen?" },
      { tema: "cantidad_empleados", categoria: "equipo", nivel: "operativo", pregunta: "¿Cuántos empleados tienen aproximadamente?" },
      { tema: "facturacion_mensual", categoria: "finanzas", nivel: "operativo", pregunta: "¿Cuál es la facturación mensual aproximada?" },
      { tema: "clientes_principales", categoria: "clientes", nivel: "operativo", pregunta: "¿Quiénes son sus clientes principales?" },
      { tema: "tipo_clientes", categoria: "clientes", nivel: "operativo", pregunta: "¿Sus clientes son empresas, consumidores finales, gobierno?" },
      { tema: "costos_fijos", categoria: "finanzas", nivel: "operativo", pregunta: "¿Cuáles son los costos fijos mensuales aproximados?" },
      { tema: "margen_operativo", categoria: "finanzas", nivel: "estrategico", pregunta: "¿Cuál es el margen operativo aproximado?" },
      { tema: "competidores", categoria: "mercado", nivel: "estrategico", pregunta: "¿Quiénes son sus principales competidores?" },
      { tema: "estacionalidad", categoria: "ventas", nivel: "estrategico", pregunta: "¿El negocio tiene estacionalidad? ¿Hay meses mejores que otros?" },
      { tema: "planes_crecimiento", categoria: "general", nivel: "estrategico", pregunta: "¿Tienen planes de crecimiento o expansión?" },
      { tema: "dolor_principal", categoria: "general", nivel: "critico", pregunta: "¿Qué es lo que más te quita el sueño del negocio?" },
    ];

    for (const tema of temasBase) {
      const estadoConocido = research.nivel_conocimiento[tema.tema.split("_")[0]] || "desconocido";
      await fetch(`${pbUrl}/api/collections/conocimiento_mapa/records`, {
        method: "POST",
        headers: pbHeaders,
        body: JSON.stringify({
          empresa_id: empresa.id,
          tema: tema.tema,
          categoria: tema.categoria,
          nivel: tema.nivel,
          estado: estadoConocido === "conocido" ? "conocido" : estadoConocido === "parcial" ? "parcial" : "desconocido",
          pregunta_sugerida: tema.pregunta,
        }),
      });
    }

    // 7. Registrar interacción
    await fetch(`${pbUrl}/api/collections/interacciones/records`, {
      method: "POST",
      headers: pbHeaders,
      body: JSON.stringify({
        empresa_id: empresa.id,
        tipo: "onboarding",
        resumen: "Investigación inicial completada",
        detalles: { fuente: urlSitio, datos_encontrados: research.datos_interesantes?.length || 0 },
      }),
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        empresa_id: empresa.id,
        saludo: research.saludo_personalizado,
        research: research,
      }),
    };

  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}