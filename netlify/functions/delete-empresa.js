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

    // Colecciones a limpiar (en orden)
    const colecciones = [
      "mensajes",
      "hechos", 
      "metricas",
      "entidades",
      "interacciones",
      "documentos_procesados",
      "conocimiento_mapa"
    ];

    // Borrar registros relacionados
    for (const col of colecciones) {
      try {
        const res = await fetch(`${pbUrl}/api/collections/${col}/records?filter=(empresa_id='${empresa_id}')&perPage=500`, { 
          headers: pbHeaders 
        });
        if (res.ok) {
          const data = await res.json();
          for (const item of data.items || []) {
            await fetch(`${pbUrl}/api/collections/${col}/records/${item.id}`, {
              method: "DELETE",
              headers: pbHeaders,
            });
          }
          console.log(`Eliminados ${data.items?.length || 0} registros de ${col}`);
        }
      } catch (e) {
        console.log(`Colección ${col} no existe o error:`, e.message);
      }
    }

    // Ahora sí borrar la empresa
    const delRes = await fetch(`${pbUrl}/api/collections/empresas/records/${empresa_id}`, {
      method: "DELETE",
      headers: pbHeaders,
    });

    if (delRes.ok) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, message: "Empresa eliminada completamente" }),
      };
    } else {
      const err = await delRes.text();
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "No se pudo eliminar la empresa", details: err }),
      };
    }

  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}