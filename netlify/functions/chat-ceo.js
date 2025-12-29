import Anthropic from "@anthropic-ai/sdk";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const { empresa_id, mensaje, archivo } = JSON.parse(event.body);
    
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
    let mensajesRecientes = [];
    let resumenConversacion = "";

    if (empresa_id) {
      // Empresa
      const empRes = await fetch(`${pbUrl}/api/collections/empresas/records/${empresa_id}`, { headers: pbHeaders });
      if (empRes.ok) {
        empresaData = await empRes.json();
        resumenConversacion = empresaData.resumen_conversacion || "";
      }

      // Hechos con fuentes
      const hechosRes = await fetch(`${pbUrl}/api/collections/hechos/records?filter=(empresa_id='${empresa_id}')&perPage=50`, { headers: pbHeaders });
      if (hechosRes.ok) {
        const data = await hechosRes.json();
        hechos = data.items || [];
      }

      // Métricas con fuentes
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

      // Mensajes recientes
      const mensajesRes = await fetch(`${pbUrl}/api/collections/mensajes/records?filter=(empresa_id='${empresa_id}')&sort=-created&perPage=10`, { headers: pbHeaders });
      if (mensajesRes.ok) {
        const data = await mensajesRes.json();
        mensajesRecientes = (data.items || []).reverse();
      }
    }

    // 3. Formatear hechos CON FUENTES
    const formatearFuente = (item) => {
      const tipo = item.fuente_tipo || "desconocido";
      const nombre = item.fuente_nombre || "";
      const fecha = item.fuente_fecha ? new Date(item.fuente_fecha).toLocaleDateString('es-AR') : "";
      
      if (tipo === "web") return `[WEB: ${nombre}, ${fecha}]`;
      if (tipo === "archivo") return `[ARCHIVO: ${nombre}, ${fecha}]`;
      if (tipo === "conversacion") return `[CONVERSACIÓN, ${fecha}]`;
      if (tipo === "research") return `[RESEARCH INICIAL, ${fecha}]`;
      return `[${fecha}]`;
    };

    const hechosConFuente = hechos.map(h => 
      `${formatearFuente(h)} ${h.hecho}`
    ).join("\n") || "Ninguno aún";

    const metricasConFuente = metricas.map(m => 
      `${formatearFuente(m)} ${m.nombre}: ${m.valor} ${m.unidad || ""} (${m.periodo || "s/periodo"})`
    ).join("\n") || "Ninguna aún";

    // 4. Construir contexto para Claude
    const urlSitio = empresaData.url_sitio || null;
    const contextoEmpresa = `
EMPRESA: ${empresaData.nombre || "Sin nombre"}
RUBRO: ${empresaData.rubro || "Desconocido"}
DESCRIPCIÓN: ${empresaData.descripcion || "Sin descripción"}
SITIO WEB: ${urlSitio || "No registrado"}
ÚLTIMO RESEARCH: ${empresaData.ultimo_research ? new Date(empresaData.ultimo_research).toLocaleDateString('es-AR') : "Nunca"}

HECHOS QUE CONOZCO (con fuentes):
${hechosConFuente}

MÉTRICAS QUE CONOZCO (con fuentes):
${metricasConFuente}

ENTIDADES QUE CONOZCO (${entidades.length}):
${entidades.map(e => `- [${e.tipo}] ${e.nombre}`).join("\n") || "Ninguna aún"}

${resumenConversacion ? `RESUMEN DE CONVERSACIONES ANTERIORES:\n${resumenConversacion}` : ""}
`.trim();

    // 5. System prompt CON CAPACIDAD WEB
    const systemPrompt = `Sos el CEO Virtual de "${empresaData.nombre || "una empresa"}".

CAPACIDADES:
1. CONOCER la empresa profundamente
2. ANALIZAR datos y dar insights útiles
3. CITAR SIEMPRE tus fuentes cuando mencionás datos
4. CONSULTAR LA WEB de la empresa si necesitás datos específicos que no tenés

PERSONALIDAD:
- Profesional pero cálido
- Directo, citando fuentes
- Transparente sobre de dónde viene tu información

CONTEXTO ACTUAL:
${contextoEmpresa}

REGLAS CRÍTICAS DE FUENTES:
1. SIEMPRE que menciones un dato, indicá de dónde viene: "Según tu web...", "Del archivo que me pasaste...", "Me comentaste que..."
2. Si un dato es viejo (más de 7 días), mencionalo: "Esto lo vi hace X días, ¿sigue vigente?"
3. Si necesitás datos específicos que no tenés, podés pedir revisar la web

PARA CONSULTAR LA WEB:
Si necesitás información específica del sitio web de la empresa y tenés la URL, incluí este tag en tu respuesta:
<consultar_web>
{
  "url": "${urlSitio || 'URL_ACA'}",
  "buscar": "descripción de qué buscar"
}
</consultar_web>

Yo haré el fetch y te daré los resultados para que los proceses.

PARA GUARDAR DATOS NUEVOS:
Si el usuario te da información nueva, incluí:
<datos_nuevos>
{
  "hechos": [{"texto": "...", "categoria": "ventas|clientes|finanzas|equipo|operaciones|productos|otro"}],
  "metricas": [{"nombre": "...", "valor": 123, "unidad": "USD", "periodo": "2024-Q4"}],
  "entidades": [{"tipo": "cliente|proveedor|producto", "nombre": "...", "datos": {}}]
}
</datos_nuevos>`;

    // 6. Construir mensaje con archivo si existe
    let contenidoUsuario = mensaje;
    let archivoInfo = null;
    
    if (archivo) {
      archivoInfo = { nombre: archivo.fileName, tipo: archivo.type };
      if (archivo.type === "tabular") {
        contenidoUsuario = `[ARCHIVO ADJUNTO: ${archivo.fileName}]

Datos del archivo:
- Columnas: ${archivo.headers.join(", ")}
- Total registros: ${archivo.totalRows}
- Muestra (primeras 5 filas): ${JSON.stringify(archivo.rows.slice(0, 5), null, 2)}

Mensaje: ${mensaje || "Analiza este archivo"}`;
      } else {
        contenidoUsuario = `[ARCHIVO ADJUNTO: ${archivo.fileName}]

Mensaje: ${mensaje || "Analiza este documento"}`;
      }
    }

    // 7. Construir historial de mensajes
    const mensajesChat = [
      ...mensajesRecientes.map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: contenidoUsuario },
    ];

    // 8. Llamar a Claude
    const client = new Anthropic({ apiKey: anthropicKey });
    let response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: systemPrompt,
      messages: mensajesChat,
    });

    let respuestaTexto = response.content[0].text;

    // 9. Procesar consulta web si la pide
    const webMatch = respuestaTexto.match(/<consultar_web>([\s\S]*?)<\/consultar_web>/);
    if (webMatch && urlSitio) {
      try {
        const webRequest = JSON.parse(webMatch[1]);
        
        // Fetch del sitio
        const siteRes = await fetch(webRequest.url || urlSitio, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; CEOVirtual/1.0)" },
        });
        
        if (siteRes.ok) {
          const html = await siteRes.text();
          const textoLimpio = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .substring(0, 10000);

          // Segunda llamada a Claude con los datos web
          const response2 = await client.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 2000,
            messages: [{
              role: "user",
              content: `Buscabas: "${webRequest.buscar}"

Contenido del sitio web (${webRequest.url}):
${textoLimpio}

Extraé la información específica que necesitabas y respondé al usuario. Citá que viene de la web con la fecha de hoy.`
            }],
          });
          
          respuestaTexto = response2.content[0].text;
        }
      } catch (e) {
        console.error("Error consultando web:", e);
        respuestaTexto = respuestaTexto.replace(/<consultar_web>[\s\S]*?<\/consultar_web>/, 
          "\n\n*No pude acceder al sitio web en este momento. ¿Podrías pasarme esa información directamente?*");
      }
    }

    // 10. Guardar datos nuevos
    const hoyISO = new Date().toISOString().split('T')[0];
    const datosMatch = respuestaTexto.match(/<datos_nuevos>([\s\S]*?)<\/datos_nuevos>/);
    if (datosMatch && empresa_id) {
      try {
        const datosNuevos = JSON.parse(datosMatch[1]);

        for (const hecho of datosNuevos.hechos || []) {
          await fetch(`${pbUrl}/api/collections/hechos/records`, {
            method: "POST",
            headers: pbHeaders,
            body: JSON.stringify({
              empresa_id,
              categoria: hecho.categoria || "otro",
              hecho: hecho.texto || hecho,
              fuente_tipo: archivoInfo ? "archivo" : "conversacion",
              fuente_nombre: archivoInfo?.nombre || null,
              fuente_fecha: hoyISO,
              relevancia: "media",
              confianza: archivoInfo ? "alta" : "media",
              vigente: true,
            }),
          });
        }

        for (const metrica of datosNuevos.metricas || []) {
          await fetch(`${pbUrl}/api/collections/metricas/records`, {
            method: "POST",
            headers: pbHeaders,
            body: JSON.stringify({
              empresa_id,
              ...metrica,
              fuente_tipo: archivoInfo ? "archivo" : "conversacion",
              fuente_nombre: archivoInfo?.nombre || null,
              fuente_fecha: hoyISO,
              confianza: archivoInfo ? "alta" : "media",
            }),
          });
        }

        for (const entidad of datosNuevos.entidades || []) {
          await fetch(`${pbUrl}/api/collections/entidades/records`, {
            method: "POST",
            headers: pbHeaders,
            body: JSON.stringify({
              empresa_id,
              ...entidad,
              fuente_tipo: archivoInfo ? "archivo" : "conversacion",
              fuente_nombre: archivoInfo?.nombre || null,
              fuente_fecha: hoyISO,
              activo: true,
            }),
          });
        }
      } catch (e) {
        console.error("Error guardando datos:", e);
      }

      respuestaTexto = respuestaTexto.replace(/<datos_nuevos>[\s\S]*?<\/datos_nuevos>/, "").trim();
    }

    // Limpiar tags de consulta web de la respuesta visible
    respuestaTexto = respuestaTexto.replace(/<consultar_web>[\s\S]*?<\/consultar_web>/, "").trim();

    // 11. Guardar mensajes
    if (empresa_id) {
      await fetch(`${pbUrl}/api/collections/mensajes/records`, {
        method: "POST",
        headers: pbHeaders,
        body: JSON.stringify({
          empresa_id,
          role: "user",
          content: contenidoUsuario,
          resumido: false,
          archivo_nombre: archivoInfo?.nombre || null,
          archivo_tipo: archivoInfo?.tipo || null,
        }),
      });

      await fetch(`${pbUrl}/api/collections/mensajes/records`, {
        method: "POST",
        headers: pbHeaders,
        body: JSON.stringify({
          empresa_id,
          role: "assistant",
          content: respuestaTexto,
          resumido: false,
        }),
      });

      // Verificar compresión
      const countRes = await fetch(`${pbUrl}/api/collections/mensajes/records?filter=(empresa_id='${empresa_id}' %26%26 resumido=false)&perPage=1`, { headers: pbHeaders });
      if (countRes.ok) {
        const countData = await countRes.json();
        if (countData.totalItems > 20) {
          await comprimirMensajes(client, pbUrl, pbHeaders, empresa_id, empresaData);
        }
      }
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

async function comprimirMensajes(client, pbUrl, pbHeaders, empresa_id, empresaData) {
  try {
    const mensajesRes = await fetch(`${pbUrl}/api/collections/mensajes/records?filter=(empresa_id='${empresa_id}' %26%26 resumido=false)&sort=created&perPage=50`, { headers: pbHeaders });
    if (!mensajesRes.ok) return;

    const mensajesData = await mensajesRes.json();
    const mensajes = mensajesData.items || [];
    
    if (mensajes.length <= 10) return;

    const mensajesAResumir = mensajes.slice(0, -10);
    const conversacion = mensajesAResumir.map(m => `${m.role === "user" ? "Usuario" : "CEO"}: ${m.content}`).join("\n\n");
    
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: `Resume esta conversación en 2-3 párrafos:
- Información clave compartida
- Decisiones o acuerdos
- Temas pendientes

Conversación:
${conversacion}

Solo el resumen:`
      }],
    });

    const nuevoResumen = response.content[0].text;
    const resumenFinal = empresaData.resumen_conversacion 
      ? `${empresaData.resumen_conversacion}\n\n---\n\n${nuevoResumen}`
      : nuevoResumen;

    await fetch(`${pbUrl}/api/collections/empresas/records/${empresa_id}`, {
      method: "PATCH",
      headers: pbHeaders,
      body: JSON.stringify({ resumen_conversacion: resumenFinal }),
    });

    for (const msg of mensajesAResumir) {
      await fetch(`${pbUrl}/api/collections/mensajes/records/${msg.id}`, {
        method: "PATCH",
        headers: pbHeaders,
        body: JSON.stringify({ resumido: true }),
      });
    }
  } catch (e) {
    console.error("Error comprimiendo:", e);
  }
}