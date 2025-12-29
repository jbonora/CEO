import Anthropic from "@anthropic-ai/sdk";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const body = JSON.parse(event.body);
    const { fileType, fileName } = body;

    const client = new Anthropic({ apiKey });

    let messages = [];

    if (fileType === "tabular") {
      const { headers, rows, totalRows } = body;
      const prompt = `Analiza estos datos tabulares de una empresa y propone un esquema de base de datos inteligente.

Archivo: ${fileName}
Columnas: ${headers.join(", ")}
Muestra (5 filas): ${JSON.stringify(rows.slice(0, 5), null, 2)}
Total de registros: ${totalRows}

Responde SOLO con JSON válido (sin markdown):
{
  "interpretacion": "descripción en 1-2 oraciones",
  "coleccion_principal": {
    "nombre": "nombre_sugerido",
    "descripcion": "para qué sirve"
  },
  "campos": [
    {
      "original": "columna original",
      "sugerido": "nombre_normalizado",
      "tipo": "text|number|date|email|url|relation|bool",
      "descripcion": "qué representa",
      "es_clave": true/false
    }
  ],
  "colecciones_relacionadas": [
    {"nombre": "...", "razon": "...", "campo_origen": "..."}
  ],
  "preguntas_ceo": ["pregunta de negocio 1", "pregunta 2"]
}`;

      messages = [{ role: "user", content: prompt }];

    } else if (fileType === "image") {
      const { base64, mediaType } = body;
      const prompt = `Analiza esta imagen de un documento empresarial (puede ser una factura, recibo, tarjeta, pizarra, etc).

Extrae TODA la información relevante que encuentres.

Responde SOLO con JSON válido (sin markdown):
{
  "interpretacion": "qué tipo de documento es y de qué se trata",
  "datos_extraidos": {
    "campo1": "valor1",
    "campo2": "valor2"
  },
  "coleccion_principal": {
    "nombre": "nombre_sugerido para guardar este tipo de datos",
    "descripcion": "para qué sirve"
  },
  "campos": [
    {
      "original": "dato encontrado",
      "sugerido": "nombre_campo",
      "tipo": "text|number|date|email|url|bool",
      "descripcion": "qué representa",
      "es_clave": true/false
    }
  ],
  "acciones_sugeridas": ["acción 1", "acción 2"],
  "preguntas_ceo": ["pregunta relevante 1"]
}`;

      messages = [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64,
            },
          },
          { type: "text", text: prompt },
        ],
      }];

    } else if (fileType === "pdf") {
      const { base64 } = body;
      const prompt = `Analiza este documento PDF empresarial.

Extrae la información más relevante: números, fechas, nombres, montos, conceptos clave.

Responde SOLO con JSON válido (sin markdown):
{
  "interpretacion": "qué tipo de documento es y resumen del contenido",
  "datos_extraidos": {
    "campo1": "valor1",
    "campo2": "valor2"
  },
  "coleccion_principal": {
    "nombre": "nombre_sugerido",
    "descripcion": "para qué sirve"
  },
  "campos": [
    {
      "original": "dato encontrado",
      "sugerido": "nombre_campo",
      "tipo": "text|number|date|email|url|bool",
      "descripcion": "qué representa",
      "es_clave": true/false
    }
  ],
  "resumen_ejecutivo": "resumen en 2-3 oraciones para un CEO",
  "acciones_sugeridas": ["acción 1", "acción 2"],
  "preguntas_ceo": ["pregunta relevante 1"]
}`;

      messages = [{
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64,
            },
          },
          { type: "text", text: prompt },
        ],
      }];

    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Tipo de archivo no soportado" }),
      };
    }

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: messages,
    });

    const responseText = message.content[0].text;
    const cleanJson = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleanJson);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
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