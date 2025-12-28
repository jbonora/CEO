import Anthropic from "@anthropic-ai/sdk";

export async function handler(event) {
  // Solo permitir POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const { fileContent, fileName, headers, totalRows } = JSON.parse(event.body);

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const prompt = `Analiza estos datos de un archivo CSV/Excel de una empresa y propone un esquema de base de datos inteligente.

Archivo: ${fileName}
Columnas encontradas: ${headers.join(", ")}
Muestra de datos (primeras 5 filas):
${JSON.stringify(fileContent.slice(0, 5), null, 2)}
Total de registros: ${totalRows}

Responde SOLO con un JSON válido (sin markdown, sin backticks) con esta estructura:
{
  "interpretacion": "Qué tipo de datos son estos en 1-2 oraciones",
  "coleccion_principal": {
    "nombre": "nombre_sugerido",
    "descripcion": "para qué sirve esta colección"
  },
  "campos": [
    {
      "original": "nombre columna original",
      "sugerido": "nombre_normalizado",
      "tipo": "text|number|date|email|url|relation|bool",
      "descripcion": "qué representa este campo",
      "es_clave": true/false
    }
  ],
  "colecciones_relacionadas": [
    {
      "nombre": "nombre_coleccion",
      "razon": "por qué extraer esto a otra colección",
      "campo_origen": "de qué columna se extrae"
    }
  ],
  "insights": ["observación útil 1", "observación útil 2"],
  "preguntas_ceo": ["pregunta de negocio que podrías responder con estos datos"]
}`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const responseText = message.content[0].text;
    
    // Intentar parsear para validar que es JSON válido
    const parsed = JSON.parse(responseText);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parsed),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
