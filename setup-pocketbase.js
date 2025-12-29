// setup-pocketbase.js
// Ejecutar con: node setup-pocketbase.js

const POCKETBASE_URL = "https://ceo-virtual.pockethost.io";
const ADMIN_EMAIL = "jbonora@gmail.com";
const ADMIN_PASSWORD = "pJunio2301.";

async function setup() {
  console.log("🚀 Configurando CEO Virtual en PocketBase...\n");

  // 1. Autenticarse como admin (PocketBase 0.20+)
  console.log("1. Autenticando como admin...");
  const authRes = await fetch(`${POCKETBASE_URL}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });

  if (!authRes.ok) {
    const errText = await authRes.text();
    console.error("❌ Error de autenticación:", errText);
    process.exit(1);
  }

  const authData = await authRes.json();
  const token = authData.token;
  console.log("✅ Autenticado!\n");

  const headers = {
    "Content-Type": "application/json",
    "Authorization": token,
  };

  // Primero obtener el ID de la colección users
  const usersRes = await fetch(`${POCKETBASE_URL}/api/collections/users`, { headers });
  const usersData = await usersRes.json();
  const usersCollectionId = usersData.id || "_pb_users_auth_";

  // 2. Definir colecciones (formato PocketBase 0.20+)
  const collections = [
    {
      name: "empresas",
      type: "base",
      fields: [
        { name: "nombre", type: "text", required: true },
        { name: "rubro", type: "text" },
        { name: "descripcion", type: "editor" },
        { name: "productos_servicios", type: "text" },
        { name: "tamano_equipo", type: "number" },
        { name: "tipo_clientes", type: "text" },
        { name: "preocupacion_principal", type: "text" },
        { name: "sistemas_actuales", type: "text" },
        { name: "onboarding_completo", type: "bool" },
        { name: "usuario_id", type: "relation", collectionId: usersCollectionId, maxSelect: 1 },
      ],
    },
    {
      name: "hechos",
      type: "base",
      fields: [
        { name: "empresa_id", type: "relation", required: true, collectionId: "EMPRESAS_ID", maxSelect: 1 },
        { name: "categoria", type: "select", values: ["ventas", "clientes", "finanzas", "equipo", "operaciones", "productos", "proveedores", "mercado", "otro"] },
        { name: "hecho", type: "editor", required: true },
        { name: "fuente", type: "text" },
        { name: "fecha_dato", type: "date" },
        { name: "relevancia", type: "select", values: ["alta", "media", "baja"] },
        { name: "vigente", type: "bool" },
      ],
    },
    {
      name: "metricas",
      type: "base",
      fields: [
        { name: "empresa_id", type: "relation", required: true, collectionId: "EMPRESAS_ID", maxSelect: 1 },
        { name: "nombre", type: "text", required: true },
        { name: "valor", type: "number", required: true },
        { name: "periodo", type: "text" },
        { name: "unidad", type: "text" },
        { name: "categoria", type: "select", values: ["ventas", "finanzas", "operaciones", "clientes", "equipo", "otro"] },
        { name: "fuente", type: "text" },
        { name: "fecha_dato", type: "date" },
      ],
    },
    {
      name: "entidades",
      type: "base",
      fields: [
        { name: "empresa_id", type: "relation", required: true, collectionId: "EMPRESAS_ID", maxSelect: 1 },
        { name: "tipo", type: "select", required: true, values: ["cliente", "proveedor", "empleado", "producto", "servicio", "proyecto", "otro"] },
        { name: "nombre", type: "text", required: true },
        { name: "datos", type: "json" },
        { name: "notas", type: "editor" },
        { name: "activo", type: "bool" },
      ],
    },
    {
      name: "interacciones",
      type: "base",
      fields: [
        { name: "empresa_id", type: "relation", required: true, collectionId: "EMPRESAS_ID", maxSelect: 1 },
        { name: "tipo", type: "select", values: ["sugerencia", "alerta", "analisis", "consulta", "onboarding"] },
        { name: "resumen", type: "text", required: true },
        { name: "detalles", type: "json" },
        { name: "accionado", type: "bool" },
      ],
    },
    {
      name: "documentos_procesados",
      type: "base",
      fields: [
        { name: "empresa_id", type: "relation", required: true, collectionId: "EMPRESAS_ID", maxSelect: 1 },
        { name: "nombre_archivo", type: "text", required: true },
        { name: "tipo_archivo", type: "select", values: ["csv", "excel", "pdf", "imagen", "otro"] },
        { name: "resumen", type: "editor" },
        { name: "hechos_extraidos", type: "number" },
        { name: "metricas_extraidas", type: "number" },
        { name: "entidades_extraidas", type: "number" },
      ],
    },
    {
      name: "conocimiento_mapa",
      type: "base",
      fields: [
        { name: "empresa_id", type: "relation", required: true, collectionId: "EMPRESAS_ID", maxSelect: 1 },
        { name: "tema", type: "text", required: true },
        { name: "categoria", type: "select", values: ["general", "finanzas", "ventas", "clientes", "equipo", "operaciones", "mercado"] },
        { name: "nivel", type: "select", values: ["critico", "operativo", "estrategico"] },
        { name: "estado", type: "select", values: ["desconocido", "parcial", "conocido"] },
        { name: "pregunta_sugerida", type: "text" },
        { name: "fuente", type: "text" },
        { name: "fecha_aprendido", type: "date" },
        { name: "valor_resumen", type: "text" },
      ],
    },
  ];

  // 3. Eliminar colecciones existentes (para recrearlas con campos)
  console.log("2. Eliminando colecciones vacías existentes...");
  for (const col of collections) {
    const delRes = await fetch(`${POCKETBASE_URL}/api/collections/${col.name}`, {
      method: "DELETE",
      headers,
    });
    if (delRes.ok) {
      console.log(`   🗑️  ${col.name} eliminada`);
    }
  }

  // 4. Crear colección empresas primero (otras dependen de ella)
  console.log("\n3. Creando colección empresas...");
  const empresasCol = collections.find(c => c.name === "empresas");
  const empresasRes = await fetch(`${POCKETBASE_URL}/api/collections`, {
    method: "POST",
    headers,
    body: JSON.stringify(empresasCol),
  });

  if (!empresasRes.ok) {
    const err = await empresasRes.json();
    console.error("❌ Error creando empresas:", err);
    process.exit(1);
  }

  const empresasData = await empresasRes.json();
  const empresasId = empresasData.id;
  console.log(`   ✅ empresas creada (ID: ${empresasId})`);

  // 5. Crear las demás colecciones
  console.log("\n4. Creando colecciones dependientes...");
  for (const col of collections) {
    if (col.name === "empresas") continue;

    // Reemplazar EMPRESAS_ID con el ID real
    const colCopy = JSON.parse(JSON.stringify(col));
    colCopy.fields = colCopy.fields.map(f => {
      if (f.collectionId === "EMPRESAS_ID") {
        f.collectionId = empresasId;
      }
      return f;
    });

    const createRes = await fetch(`${POCKETBASE_URL}/api/collections`, {
      method: "POST",
      headers,
      body: JSON.stringify(colCopy),
    });

    if (createRes.ok) {
      console.log(`   ✅ ${col.name} creada`);
    } else {
      const error = await createRes.json();
      console.error(`   ❌ Error creando ${col.name}:`, error);
    }
  }

  console.log("\n🎉 ¡Configuración completada!");
  console.log("\nColecciones creadas:");
  console.log("  - empresas (perfil de cada empresa)");
  console.log("  - hechos (conocimiento cualitativo)");
  console.log("  - metricas (datos numéricos)");
  console.log("  - entidades (clientes, productos, etc.)");
  console.log("  - interacciones (log del CEO)");
  console.log("  - documentos_procesados (registro de archivos)");
  console.log("  - conocimiento_mapa (lo que el CEO sabe/no sabe)");
  console.log("\n👉 Ahora agregá estas variables a Netlify:");
  console.log(`   POCKETBASE_URL=${POCKETBASE_URL}`);
  console.log(`   POCKETBASE_ADMIN_EMAIL=tu-email`);
  console.log(`   POCKETBASE_ADMIN_PASSWORD=tu-pass`);
}

setup().catch(console.error);
