export async function handler(event) {
  const pbUrl = process.env.POCKETBASE_URL;
  const pbEmail = process.env.POCKETBASE_ADMIN_EMAIL;
  const pbPassword = process.env.POCKETBASE_ADMIN_PASSWORD;

  console.log("PB URL:", pbUrl);
  console.log("PB Email exists:", !!pbEmail);

  try {
    // Autenticar
    const authRes = await fetch(`${pbUrl}/api/collections/_superusers/auth-with-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: pbEmail, password: pbPassword }),
    });
    
    if (!authRes.ok) {
      const errText = await authRes.text();
      console.error("Auth failed:", errText);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Auth failed", details: errText }),
      };
    }

    const authData = await authRes.json();
    console.log("Auth OK, token exists:", !!authData.token);

    const pbHeaders = {
      "Content-Type": "application/json",
      "Authorization": authData.token,
    };

    // Obtener empresas
    const empresasRes = await fetch(`${pbUrl}/api/collections/empresas/records?sort=-created`, {
      headers: pbHeaders,
    });
    
    console.log("Empresas response status:", empresasRes.status);

    if (!empresasRes.ok) {
      const errText = await empresasRes.text();
      console.error("Empresas fetch failed:", errText);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Fetch empresas failed", details: errText }),
      };
    }

    const empresasData = await empresasRes.json();
    console.log("Empresas count:", empresasData.items?.length || 0);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresas: empresasData.items || [] }),
    };

  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}