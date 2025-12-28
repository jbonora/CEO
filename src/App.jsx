import { useState } from "react";
import { Upload, Brain, Database, CheckCircle, Loader2, Table, FileSpreadsheet } from "lucide-react";
import Papa from "papaparse";

export default function App() {
  const [step, setStep] = useState("upload");
  const [fileData, setFileData] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("");

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setLoading(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        setFileData({
          headers: results.meta.fields,
          rows: results.data.slice(0, 100),
          totalRows: results.data.length,
        });
        setStep("preview");
        setLoading(false);
      },
      error: () => {
        setLoading(false);
        alert("Error al leer el archivo");
      },
    });
  };

  const analyzeWithAI = async () => {
    setLoading(true);

    try {
      // Llamada a TU función serverless (no directo a Anthropic)
      const response = await fetch("/.netlify/functions/analyze-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileContent: fileData.rows,
          fileName: fileName,
          headers: fileData.headers,
          totalRows: fileData.totalRows,
        }),
      });

      if (!response.ok) throw new Error("Error en el análisis");

      const parsed = await response.json();
      setAnalysis(parsed);
      setStep("analysis");
    } catch (err) {
      console.error(err);
      alert("Error en el análisis. Revisá la consola.");
    }
    setLoading(false);
  };

  const simulatePocketBase = () => {
    setStep("saved");
  };

  const resetApp = () => {
    setStep("upload");
    setFileData(null);
    setAnalysis(null);
    setFileName("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
            CEO Virtual
          </h1>
          <p className="text-slate-400">Analizador Inteligente de Datos</p>
        </div>

        {/* Progress Steps */}
        <div className="flex justify-center gap-4 mb-8">
          {[
            { id: "upload", icon: Upload, label: "Subir" },
            { id: "preview", icon: Table, label: "Vista previa" },
            { id: "analysis", icon: Brain, label: "Análisis IA" },
            { id: "saved", icon: Database, label: "Guardado" },
          ].map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div className={`flex flex-col items-center ${
                step === s.id ? "text-emerald-400" :
                ["upload", "preview", "analysis", "saved"].indexOf(step) > i ? "text-blue-400" : "text-slate-600"
              }`}>
                <s.icon size={24} />
                <span className="text-xs mt-1">{s.label}</span>
              </div>
              {i < 3 && (
                <div className={`w-12 h-0.5 mx-2 ${
                  ["upload", "preview", "analysis", "saved"].indexOf(step) > i ? "bg-blue-400" : "bg-slate-700"
                }`} />
              )}
            </div>
          ))}
        </div>

        {/* Upload Step */}
        {step === "upload" && (
          <div className="border-2 border-dashed border-slate-600 rounded-2xl p-12 text-center hover:border-emerald-500 transition-colors">
            <FileSpreadsheet size={48} className="mx-auto mb-4 text-slate-500" />
            <p className="text-slate-300 mb-4">Subí un archivo CSV o Excel</p>
            <label className="cursor-pointer bg-emerald-600 hover:bg-emerald-500 px-6 py-3 rounded-lg font-medium transition-colors inline-block">
              Seleccionar archivo
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            {loading && <Loader2 className="animate-spin mx-auto mt-4" />}
          </div>
        )}

        {/* Preview Step */}
        {step === "preview" && fileData && (
          <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-semibold">{fileName}</h2>
                <p className="text-slate-400 text-sm">
                  {fileData.totalRows} registros • {fileData.headers.length} columnas
                </p>
              </div>
              <button
                onClick={analyzeWithAI}
                disabled={loading}
                className="bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 px-5 py-2.5 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={18} /> : <Brain size={18} />}
                Analizar con IA
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    {fileData.headers.map((h) => (
                      <th key={h} className="text-left p-2 text-slate-400 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fileData.rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-b border-slate-700/50">
                      {fileData.headers.map((h) => (
                        <td key={h} className="p-2 text-slate-300 truncate max-w-[150px]">
                          {row[h]?.toString() || "-"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Analysis Step */}
        {step === "analysis" && analysis && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-blue-900/50 to-emerald-900/50 rounded-2xl p-6 border border-emerald-700/50">
              <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">
                <Brain className="text-emerald-400" /> Interpretación
              </h2>
              <p className="text-slate-300">{analysis.interpretacion}</p>
            </div>

            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Database className="text-blue-400" />
                Colección: <span className="text-emerald-400">{analysis.coleccion_principal.nombre}</span>
              </h3>
              <p className="text-slate-400 text-sm mb-4">{analysis.coleccion_principal.descripcion}</p>

              <div className="space-y-2">
                {analysis.campos.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 bg-slate-900/50 rounded-lg p-3">
                    <code className="text-slate-500 text-sm w-32 truncate">{c.original}</code>
                    <span className="text-slate-600">→</span>
                    <code className="text-emerald-400 font-medium w-32">{c.sugerido}</code>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      c.tipo === "number" ? "bg-purple-900 text-purple-300" :
                      c.tipo === "date" ? "bg-orange-900 text-orange-300" :
                      c.tipo === "email" ? "bg-cyan-900 text-cyan-300" :
                      "bg-slate-700 text-slate-300"
                    }`}>{c.tipo}</span>
                    <span className="text-slate-500 text-sm flex-1 truncate">{c.descripcion}</span>
                    {c.es_clave && <span className="text-yellow-500 text-xs">🔑</span>}
                  </div>
                ))}
              </div>
            </div>

            {analysis.colecciones_relacionadas?.length > 0 && (
              <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
                <h3 className="font-semibold mb-3">Colecciones relacionadas sugeridas</h3>
                {analysis.colecciones_relacionadas.map((c, i) => (
                  <div key={i} className="bg-slate-900/50 rounded-lg p-3 mb-2">
                    <span className="text-blue-400 font-medium">{c.nombre}</span>
                    <p className="text-slate-400 text-sm">{c.razon}</p>
                  </div>
                ))}
              </div>
            )}

            {analysis.preguntas_ceo?.length > 0 && (
              <div className="bg-gradient-to-r from-amber-900/30 to-orange-900/30 rounded-2xl p-6 border border-amber-700/30">
                <h3 className="font-semibold mb-3 text-amber-300">💡 Preguntas que podrías responder</h3>
                <ul className="space-y-2">
                  {analysis.preguntas_ceo.map((p, i) => (
                    <li key={i} className="text-slate-300">"{p}"</li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={simulatePocketBase}
              className="w-full bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 py-4 rounded-xl font-semibold text-lg transition-all"
            >
              Crear esquema en PocketBase →
            </button>
          </div>
        )}

        {/* Saved Step */}
        {step === "saved" && (
          <div className="text-center py-12">
            <CheckCircle size={64} className="mx-auto mb-4 text-emerald-400" />
            <h2 className="text-2xl font-bold mb-2">¡Esquema creado!</h2>
            <p className="text-slate-400 mb-6">Los datos fueron estructurados e importados a PocketBase</p>
            <button
              onClick={resetApp}
              className="bg-slate-700 hover:bg-slate-600 px-6 py-3 rounded-lg"
            >
              Analizar otro archivo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}