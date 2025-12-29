import Anthropic from "@anthropic-ai/sdk";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const { empresa_id, mensaje, historial } = JSON.parse(event.body);
    
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
    const pbHeaders = {
      "Content-Type": "application/json",
      "Authorization": authData.token,
    };

    // 2. Obtener contexto de la empresa
    let empresaData = {};
    let hechos = [];
    let metricas = [];
    let entidades = [];
    let conocimientoMapa = [];

    if (empresa_id) {
      // Empresa
      const empRes = await fetch(`${pbUrl}/api/collections/empresas/records/${empresa_id}`, { headers: pbHeaders });
      if (empRes.ok) empresaData = await empRes.json();

      // Hechos
      const hechosRes = await fetch(`${pbUrl}/api/collections/hechos/records?filter=(empresa_id='${empresa_id}')&perPage=50`, { headers: pbHeaders });
      if (hechosRes.ok) {
        const data = await hechosRes.json();
        hechos = data.items || [];
      }

      // Métricas
      const metricasRes = await fetch(`${pbUrl}/api/collections/metricas/records?filter=(empresa_id='${empresa_id}')&perPage=50`, { headers: pbHeaders });
      if (metricasRes.ok) {
        const data = await metricasRes.json();
        metricas = data.items || [];
      }

      // Entidades
      const entidadesRes = await fetch(`${pbUrl}/api/collections/entidades/records?filter=(empresa_id='${empresa_id}')&perPage=50`, { headers: pbHeaders });
      if (entidadesRes.ok) {
        const data = await entidadesRes.json();
        entidades = data.items || [];
      }

      // Mapa de conocimiento
      const mapaRes = await fetch(`${pbUrl}/api/collections/conocimiento_mapa/records?filter=(empresa_id='${empresa_id}')`, { headers: pbHeaders });
      if (mapaRes.ok) {
        const data = await mapaRes.json();
        conocimientoMapa = data.items || [];
      }
    }

    // 3. Construir contexto para Claude
    const conocido = conocimientoMapa.filter(k => k.estado === "conocido").map(k => k.tema);
    const desconocido = conocimientoMapa.filter(k => k.estado === "desconocido");
    const preguntasPendientes = desconocido.slice(0, 3).map(k => k.pregunta_sugerida);

    const contextoEmpresa = `
EMPRESA: ${empresaData.nombre || "Sin nombre"}
RUBRO: ${empresaData.rubro || "Desconocido"}
DESCRIPCIÓN: ${empresaData.descripcion || "Sin descripción"}
PRODUCTOS/SERVICIOS: ${empresaData.productos_servicios || "Desconocido"}
TAMAÑO EQUIPO: ${empresaData.tamano_equipo || "Desconocido"}

HECHOS QUE CONOZCO (${hechos.length}):
${hechos.map(h => `- [${h.categoria}] ${h.hecho}`).join("\n") || "Ninguno aún"}

MÉTRICAS QUE CONOZCO (${metricas.length}):
${metricas.map(m => `- ${m.nombre}: ${m.valor} ${m.unidad || ""} (${m.periodo || "s/periodo"})`).join("\n") || "Ninguna aún"}

ENTIDADES QUE CONOZCO (${entidades.length}):
${entidades.map(e => `- [${e.tipo}] ${e.nombre}`).join("\n") || "Ninguna aún"}

LO QUE SÉ: ${conocido.join(", ") || "Muy poco"}
LO QUE NO SÉ Y DEBERÍA PREGUNTAR: ${preguntasPendientes.join(" | ") || "Nada pendiente"}
`.trim();

    // 4. Construir mensajes para Claude
    const systemPrompt = `Sos el CEO Virtual de "${empresaData.nombre || "una empresa"}". Tu rol es:

1. CONOCER la empresa profundamente
2. ANALIZAR datos y dar insights útiles
3. PREGUNTAR lo que no sabés (con tacto, sin ser invasivo)
4. RECORDAR todo lo que te dicen

PERSONALIDAD:
- Profesional pero cálido
- Directo, sin rodeos innecesarios
- Curioso por entender el negocio
- Das opiniones cuando tenés datos, admitís cuando no sabés

CONTEXTO ACTUAL DE LA EMPRESA:
${contextoEmpresa}

REGLAS:
- Si te dan información nueva, agradecé brevemente y usala
- Si necesitás datos para responder, preguntá específicamente qué necesitás
- No inventes números ni datos que no tenés
- Si detectás algo preocupante en los datos, mencionalo con tacto
- Mantené las respuestas concisas (2-4 oraciones generalmente)

IMPORTANTE: Si el usuario te da información nueva (números, hechos, datos), responde con un JSON al final de tu mensaje entre tags <datos_nuevos> con este formato:
<datos_nuevos>
{
  "hechos": ["hecho 1", "hecho 2"],
  "metricas": [{"nombre": "ventas_mensuales", "valor": 50000, "unidad": "USD", "periodo": "2024-01"}],
  "entidades": [{"tipo": "cliente", "nombre": "Acme Corp", "datos": {}}],
  "conocimiento_actualizar": [{"tema": "facturacion_mensual", "estado": "conocido", "valor_resumen": "$50,000/mes"}]
}
</datos_nuevos>

Si no hay datos nuevos, no incluyas el tag.`;

    const mensajesChat = [
      ...(historial || []).map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
      { role: "user", content: mensaje },
    ];

    // 5. Llamar a Claude
    const client = new Anthropic({ apiKey: anthropicKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: systemPrompt,
      messages: mensajesChat,
    });

    let respuestaTexto = response.content[0].text;

    // 6. Extraer y guardar datos nuevos si los hay
    const datosMatch = respuestaTexto.match(/<datos_nuevos>([\s\S]*?)<\/datos_nuevos>/);
    if (datosMatch && empresa_id) {
      try {
        const datosNuevos = JSON.parse(datosMatch[1]);

        // Guardar hechos
        for (const hecho of datosNuevos.hechos || []) {
          await fetch(`${pbUrl}/api/collections/hechos/records`, {
            method: "POST",
            headers: pbHeaders,
            body: JSON.stringify({
              empresa_id,
              categoria: "otro",
              hecho,
              fuente: "conversación",
              relevancia: "media",
              vigente: true,
            }),
          });
        }

        // Guardar métricas
        for (const metrica of datosNuevos.metricas || []) {
          await fetch(`${pbUrl}/api/collections/metricas/records`, {
            method: "POST",
            headers: pbHeaders,
            body: JSON.stringify({
              empresa_id,
              ...metrica,
              fuente: "conversación",
            }),
          });
        }

        // Guardar entidades
        for (const entidad of datosNuevos.entidades || []) {
          await fetch(`${pbUrl}/api/collections/entidades/records`, {
            method: "POST",
            headers: pbHeaders,
            body: JSON.stringify({
              empresa_id,
              ...entidad,
              activo: true,
            }),
          });
        }

        // Actualizar mapa de conocimiento
        for (const update of datosNuevos.conocimiento_actualizar || []) {
          const mapaItem = conocimientoMapa.find(k => k.tema === update.tema);
          if (mapaItem) {
            await fetch(`${pbUrl}/api/collections/conocimiento_mapa/records/${mapaItem.id}`, {
              method: "PATCH",
              headers: pbHeaders,
              body: JSON.stringify({
                estado: update.estado,
                valor_resumen: update.valor_resumen,
                fecha_aprendido: new Date().toISOString(),
              }),
            });
          }
        }
      } catch (e) {
        console.error("Error guardando datos nuevos:", e);
      }

      // Quitar el tag de la respuesta visible
      respuestaTexto = respuestaTexto.replace(/<datos_nuevos>[\s\S]*?<\/datos_nuevos>/, "").trim();
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ respuesta: respuestaTexto }),
    };

  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}