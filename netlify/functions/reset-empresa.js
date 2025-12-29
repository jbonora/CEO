export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const { empresa_id } = JSON.parse(event.body);
  
  if (!empresa_id) {
    return { statusCode: 400, body: JSON.stringify({ error: "empresa_id requerido" }) };
  }

  const pbUrl = process.env.POCKETBASE_URL;
  const pbEmail = process.env.POCKETBASE_ADMIN_EMAIL;
  const pbPassword = process.env.POCKETBASE_ADMIN_PASSWORD;

  try {
    // Autenticar
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

    // 1. Borrar todos los mensajes de esta empresa
    const mensajesRes = await fetch(`${pbUrl}/api/collections/mensajes/records?filter=(empresa_id='${empresa_id}')&perPage=500`, { headers: pbHeaders });
    if (mensajesRes.ok) {
      const mensajesData = await mensajesRes.json();
      for (const msg of mensajesData.items || []) {
        await fetch(`${pbUrl}/api/collections/mensajes/records/${msg.id}`, {
          method: "DELETE",
          headers: pbHeaders,
        });
      }
    }

    // 2. Limpiar resumen de conversación en la empresa
    await fetch(`${pbUrl}/api/collections/empresas/records/${empresa_id}`, {
      method: "PATCH",
      headers: pbHeaders,
      body: JSON.stringify({ resumen_conversacion: "" }),
    });

    // 3. Opcional: resetear hechos aprendidos en conversación
    const hechosRes = await fetch(`${pbUrl}/api/collections/hechos/records?filter=(empresa_id='${empresa_id}' %26%26 fuente='conversación')&perPage=500`, { headers: pbHeaders });
    if (hechosRes.ok) {
      const hechosData = await hechosRes.json();
      for (const hecho of hechosData.items || []) {
        await fetch(`${pbUrl}/api/collections/hechos/records/${hecho.id}`, {
          method: "DELETE",
          headers: pbHeaders,
        });
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, message: "Conversación reiniciada" }),
    };

  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}