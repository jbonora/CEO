import { useState, useRef, useEffect } from "react";
import { Upload, Brain, Database, CheckCircle, Loader2, FileSpreadsheet, FileText, Image, File, Send, Building2, Globe, MessageSquare } from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";

export default function App() {
  const [mode, setMode] = useState("home"); // home | setup | onboarding | chat | upload
  const [empresa, setEmpresa] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [setupData, setSetupData] = useState({ nombre: "", url: "", email: "" });
  const messagesEndRef = useRef(null);

  // Auto-scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // === SETUP: Investigar empresa ===
  const handleSetup = async () => {
    if (!setupData.nombre.trim()) {
      alert("El nombre de la empresa es requerido");
      return;
    }

    setLoading(true);
    setMode("onboarding");
    setMessages([{ role: "system", content: "Investigando sobre " + setupData.nombre + "..." }]);

    try {
      const res = await fetch("/.netlify/functions/research-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombreEmpresa: setupData.nombre,
          urlSitio: setupData.url,
          emailCliente: setupData.email,
        }),
      });

      const data = await res.json();
      setEmpresa({ id: data.empresa_id, nombre: setupData.nombre });
      
      setMessages([
        { 
          role: "assistant", 
          content: data.saludo + "\n\nComo nuevo CEO, necesito entender mejor los números internos y la operación. ¿Puedo hacerte algunas preguntas?" 
        }
      ]);
    } catch (err) {
      console.error(err);
      setMessages([{ role: "assistant", content: "Hubo un error en la investigación. Pero no importa, ¡empecemos de cero! Contame sobre " + setupData.nombre + ". ¿A qué se dedican?" }]);
    }
    setLoading(false);
  };

  // === CHAT: Enviar mensaje ===
  const handleSendMessage = async () => {
    if (!inputValue.trim() || loading) return;

    const userMessage = inputValue;
    setInputValue("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const res = await fetch("/.netlify/functions/chat-ceo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresa?.id,
          mensaje: userMessage,
          historial: messages.slice(-10), // Últimos 10 mensajes para contexto
        }),
      });

      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.respuesta }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: "assistant", content: "Perdón, tuve un problema. ¿Podés repetir?" }]);
    }
    setLoading(false);
  };

  // === UPLOAD: Procesar archivo ===
  const [fileData, setFileData] = useState(null);
  const [fileType, setFileType] = useState(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null);
  const [analysis, setAnalysis] = useState(null);

  const detectFileType = (file) => {
    const ext = file.name.split(".").pop().toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
    if (ext === "pdf") return "pdf";
    if (["xlsx", "xls"].includes(ext)) return "excel";
    if (ext === "csv") return "csv";
    return "unknown";
  };

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setLoading(true);
    const type = detectFileType(file);
    setFileType(type);

    try {
      if (type === "csv") {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: true,
          complete: (results) => {
            setFileData({ type: "tabular", headers: results.meta.fields, rows: results.data.slice(0, 100), totalRows: results.data.length });
            setPreview({ type: "table", data: results.data.slice(0, 5), headers: results.meta.fields });
            setLoading(false);
          },
        });
      } else if (type === "excel") {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const headers = jsonData[0] || [];
        const rows = jsonData.slice(1).map(row => {
          const obj = {};
          headers.forEach((h, i) => obj[h] = row[i]);
          return obj;
        });
        setFileData({ type: "tabular", headers, rows: rows.slice(0, 100), totalRows: rows.length });
        setPreview({ type: "table", data: rows.slice(0, 5), headers });
        setLoading(false);
      } else if (type === "image") {
        const base64 = await fileToBase64(file);
        setFileData({ type: "image", base64, mediaType: file.type });
        setPreview({ type: "image", url: URL.createObjectURL(file) });
        setLoading(false);
      } else if (type === "pdf") {
        const base64 = await fileToBase64(file);
        setFileData({ type: "pdf", base64 });
        setPreview({ type: "pdf", name: file.name, size: (file.size / 1024).toFixed(1) + " KB" });
        setLoading(false);
      }
    } catch (err) {
      alert("Error al leer el archivo");
      setLoading(false);
    }
  };

  const analyzeFile = async () => {
    setLoading(true);
    try {
      const res = await fetch("/.netlify/functions/analyze-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileType: fileData.type, fileName, empresa_id: empresa?.id, ...fileData }),
      });
      const data = await res.json();
      setAnalysis(data);
    } catch (err) {
      alert("Error en el análisis");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* HOME */}
      {mode === "home" && (
        <div className="flex flex-col items-center justify-center min-h-screen p-6">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
            CEO Virtual
          </h1>
          <p className="text-slate-400 mb-12 text-center max-w-md">
            Tu asistente ejecutivo con inteligencia artificial. Conoce tu empresa, analiza datos y te ayuda a tomar decisiones.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
            <button
              onClick={() => setMode("setup")}
              className="bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 p-8 rounded-2xl flex flex-col items-center gap-4 transition-all"
            >
              <Building2 size={48} />
              <span className="text-xl font-semibold">Nueva Empresa</span>
              <span className="text-sm text-slate-300">Configurar un nuevo CEO</span>
            </button>
            
            <button
              onClick={() => empresa ? setMode("chat") : alert("Primero configurá una empresa")}
              className="bg-slate-700 hover:bg-slate-600 p-8 rounded-2xl flex flex-col items-center gap-4 transition-all"
            >
              <MessageSquare size={48} />
              <span className="text-xl font-semibold">Continuar</span>
              <span className="text-sm text-slate-400">{empresa ? empresa.nombre : "Sin empresa activa"}</span>
            </button>
          </div>
        </div>
      )}

      {/* SETUP */}
      {mode === "setup" && (
        <div className="flex flex-col items-center justify-center min-h-screen p-6">
          <div className="w-full max-w-md">
            <h2 className="text-2xl font-bold mb-2">Configurar Nueva Empresa</h2>
            <p className="text-slate-400 mb-8">El CEO investigará todo lo posible antes de presentarse</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Nombre de la empresa *</label>
                <input
                  type="text"
                  value={setupData.nombre}
                  onChange={(e) => setSetupData({ ...setupData, nombre: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 focus:outline-none focus:border-emerald-500"
                  placeholder="Ej: Distribuidora Solar SA"
                />
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-1">Sitio web (opcional)</label>
                <div className="flex items-center gap-2">
                  <Globe size={20} className="text-slate-500" />
                  <input
                    type="url"
                    value={setupData.url}
                    onChange={(e) => setSetupData({ ...setupData, url: e.target.value })}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 focus:outline-none focus:border-emerald-500"
                    placeholder="https://ejemplo.com"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-1">Email del cliente (opcional)</label>
                <input
                  type="email"
                  value={setupData.email}
                  onChange={(e) => setSetupData({ ...setupData, email: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 focus:outline-none focus:border-emerald-500"
                  placeholder="cliente@empresa.com"
                />
              </div>
            </div>
            
            <button
              onClick={handleSetup}
              disabled={loading || !setupData.nombre.trim()}
              className="w-full mt-8 bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 py-4 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" /> : <Brain />}
              {loading ? "Investigando..." : "Iniciar CEO Virtual"}
            </button>
            
            <button onClick={() => setMode("home")} className="w-full mt-4 text-slate-500 hover:text-slate-300">
              ← Volver
            </button>
          </div>
        </div>
      )}

      {/* ONBOARDING / CHAT */}
      {(mode === "onboarding" || mode === "chat") && (
        <div className="flex flex-col h-screen">
          {/* Header */}
          <div className="bg-slate-800/50 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full flex items-center justify-center">
                <Brain size={20} />
              </div>
              <div>
                <h1 className="font-semibold">CEO Virtual</h1>
                <p className="text-sm text-slate-400">{empresa?.nombre || "Nueva empresa"}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setMode("upload")}
                className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg flex items-center gap-2 text-sm"
              >
                <Upload size={16} /> Subir archivo
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-2xl px-4 py-3 rounded-2xl ${
                  msg.role === "user" 
                    ? "bg-emerald-600 text-white" 
                    : msg.role === "system"
                      ? "bg-slate-700 text-slate-400 italic"
                      : "bg-slate-800 text-slate-200"
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-800 px-4 py-3 rounded-2xl">
                  <Loader2 className="animate-spin text-emerald-400" size={20} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="bg-slate-800/50 border-t border-slate-700 px-6 py-4">
            <div className="flex gap-3 max-w-4xl mx-auto">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Escribí tu mensaje... (Shift+Enter para nueva línea)"
                rows={1}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 resize-none overflow-hidden"
                style={{ minHeight: "48px", maxHeight: "150px" }}
                onInput={(e) => {
                  e.target.style.height = "48px";
                  e.target.style.height = Math.min(e.target.scrollHeight, 150) + "px";
                }}
              />
              <button
                onClick={handleSendMessage}
                disabled={loading || !inputValue.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 px-6 rounded-xl disabled:opacity-50"
              >
                <Send size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UPLOAD */}
      {mode === "upload" && (
        <div className="min-h-screen p-6">
          <div className="max-w-4xl mx-auto">
            <button onClick={() => setMode("chat")} className="text-slate-400 hover:text-white mb-6">
              ← Volver al chat
            </button>
            
            <h2 className="text-2xl font-bold mb-6">Subir información</h2>

            {!fileData ? (
              <div className="border-2 border-dashed border-slate-600 rounded-2xl p-12 text-center hover:border-emerald-500 transition-colors">
                <Upload size={48} className="mx-auto mb-4 text-slate-500" />
                <p className="text-slate-300 mb-2">Subí cualquier archivo de tu empresa</p>
                <p className="text-slate-500 text-sm mb-4">CSV, Excel, PDF, o imágenes</p>
                <label className="cursor-pointer bg-emerald-600 hover:bg-emerald-500 px-6 py-3 rounded-lg font-medium inline-block">
                  Seleccionar archivo
                  <input type="file" accept=".csv,.xlsx,.xls,.pdf,.jpg,.jpeg,.png,.gif,.webp" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
            ) : !analysis ? (
              <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-semibold">{fileName}</h3>
                  <button onClick={analyzeFile} disabled={loading} className="bg-gradient-to-r from-blue-600 to-emerald-600 px-5 py-2.5 rounded-lg flex items-center gap-2">
                    {loading ? <Loader2 className="animate-spin" size={18} /> : <Brain size={18} />}
                    Analizar con IA
                  </button>
                </div>
                {preview?.type === "table" && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700">
                          {preview.headers.map((h, i) => <th key={i} className="text-left p-2 text-slate-400">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.data.map((row, i) => (
                          <tr key={i} className="border-b border-slate-700/50">
                            {preview.headers.map((h, j) => <td key={j} className="p-2 text-slate-300 truncate max-w-[150px]">{row[h]?.toString() || "-"}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {preview?.type === "image" && <img src={preview.url} alt="Preview" className="max-h-64 rounded-lg mx-auto" />}
                {preview?.type === "pdf" && <div className="text-center py-8"><FileText size={64} className="mx-auto mb-4 text-slate-500" /><p>{preview.size}</p></div>}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-gradient-to-r from-blue-900/50 to-emerald-900/50 rounded-2xl p-6 border border-emerald-700/50">
                  <h3 className="text-xl font-semibold mb-2">Interpretación</h3>
                  <p className="text-slate-300">{analysis.interpretacion}</p>
                </div>
                <button onClick={() => { setFileData(null); setAnalysis(null); setMode("chat"); }} className="w-full bg-emerald-600 py-4 rounded-xl font-semibold">
                  Listo, volver al chat
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}