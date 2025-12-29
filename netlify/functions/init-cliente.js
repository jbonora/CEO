import Anthropic from "@anthropic-ai/sdk";

export async function handler(event) {
  const empresaId = event.queryStringParameters?.empresa_id;
  
  if (!empresaId) {
    return { statusCode: 400, body: JSON.stringify({ error: "empresa_id requerido" }) };
  }

  const pbUrl = process.env.POCKETBASE_URL;
  const pbEmail = process.env.POCKETBASE_ADMIN_EMAIL;
  const pbPassword = process.env.POCKETBASE_ADMIN_PASSWORD;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  try {
    // Autenticar en PocketBase
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

    // Obtener empresa
    const empresaRes = await fetch(`${pbUrl}/api/collections/empresas/records/${empresaId}`, {
      headers: pbHeaders,
    });
    
    if (!empresaRes.ok) {
      return { statusCode: 404, body: JSON.stringify({ error: "Empresa no encontrada" }) };
    }
    
    const empresa = await empresaRes.json();

    // Obtener hechos conocidos
    const hechosRes = await fetch(`${pbUrl}/api/collections/hechos/records?filter=(empresa_id='${empresaId}')&perPage=20`, {
      headers: pbHeaders,
    });
    const hechosData = await hechosRes.json();
    const hechos = hechosData.items || [];

    // Generar saludo personalizado con Claude
    const client = new Anthropic({ apiKey: anthropicKey });

    const contexto = `
EMPRESA: ${empresa.nombre}
RUBRO: ${empresa.rubro || "No definido"}
DESCRIPCIÓN: ${empresa.descripcion || "Sin descripción"}
PRODUCTOS/SERVICIOS: ${empresa.productos_servicios || "No definido"}

HECHOS QUE INVESTIGUÉ:
${hechos.map(h => `- ${h.hecho}`).join("\n") || "Ninguno específico"}
`.trim();

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: `Sos el CEO Virtual de "${empresa.nombre}". Acabás de ser contratado y ya investigaste sobre la empresa.

Tu tarea: Generar un saludo de presentación cálido y profesional.

REGLAS:
- Mencioná algo específico que "investigaste" para demostrar que ya conocés la empresa
- Sé breve (3-4 oraciones máximo)
- Mostrá entusiasmo genuino pero profesional
- Terminá ofreciendo empezar a conocer los números internos
- NO uses frases genéricas tipo "estoy emocionado de unirme"
- SÍ mencioná algo concreto del rubro o lo que hacen`,
      messages: [{
        role: "user",
        content: `Generá tu saludo de presentación. Contexto:\n\n${contexto}`
      }],
    });

    const saludo = response.content[0].text;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        empresa: {
          id: empresa.id,
          nombre: empresa.nombre,
          rubro: empresa.rubro,
        },
        saludo,
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