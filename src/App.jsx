import { useState, useRef, useEffect } from "react";
import { Upload, Brain, Loader2, FileSpreadsheet, FileText, Image, Send, Building2, Globe, Plus, ExternalLink, Copy, Check, Paperclip, X } from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";

export default function App() {
  const [route, setRoute] = useState({ view: "loading", empresaId: null });

  // Detectar ruta al cargar
  useEffect(() => {
    const path = window.location.pathname;
    
    if (path.startsWith("/e/")) {
      // Vista cliente: /e/:empresaId
      const empresaId = path.replace("/e/", "");
      setRoute({ view: "cliente", empresaId });
    } else if (path === "/admin" || path === "/admin/") {
      // Vista admin
      setRoute({ view: "admin", empresaId: null });
    } else {
      // Por defecto ir a admin (después podés poner landing)
      setRoute({ view: "admin", empresaId: null });
    }
  }, []);

  if (route.view === "loading") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="animate-spin text-emerald-400" size={48} />
      </div>
    );
  }

  if (route.view === "admin") {
    return <AdminView />;
  }

  if (route.view === "cliente") {
    return <ClienteView empresaId={route.empresaId} />;
  }

  return null;
}

// ============================================
// VISTA ADMIN (para el vendedor)
// ============================================
function AdminView() {
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ 
    nombre: "", 
    url: "", 
    rubro: "",
    productos: "",
    clientes: "",
    empleados: "",
    ubicacion: "",
    notas: ""
  });
  const [copiedId, setCopiedId] = useState(null);

  // Cargar empresas existentes
  useEffect(() => {
    loadEmpresas();
  }, []);

  const loadEmpresas = async () => {
    try {
      const res = await fetch("/.netlify/functions/admin-empresas");
      if (res.ok) {
        const data = await res.json();
        setEmpresas(data.empresas || []);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const crearEmpresa = async () => {
    if (!formData.nombre.trim()) return;
    
    setCreating(true);
    try {
      const res = await fetch("/.netlify/functions/research-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombreEmpresa: formData.nombre,
          urlSitio: formData.url,
        }),
      });
      
      if (res.ok) {
        setFormData({ nombre: "", url: "" });
        setShowForm(false);
        loadEmpresas();
      }
    } catch (err) {
      console.error(err);
      alert("Error al crear empresa");
    }
    setCreating(false);
  };

  const copyLink = (empresaId) => {
    const link = `${window.location.origin}/e/${empresaId}`;
    navigator.clipboard.writeText(link);
    setCopiedId(empresaId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const resetEmpresa = async (empresaId, nombre) => {
    if (!confirm(`¿Reiniciar conversación de "${nombre}"?\n\nEsto borrará todo el historial de chat y lo que el CEO aprendió en conversaciones. La investigación inicial se mantiene.`)) {
      return;
    }

    try {
      const res = await fetch("/.netlify/functions/reset-empresa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: empresaId }),
      });

      if (res.ok) {
        alert("✅ Conversación reiniciada");
      } else {
        alert("Error al reiniciar");
      }
    } catch (err) {
      console.error(err);
      alert("Error al reiniciar");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
              CEO Virtual
            </h1>
            <p className="text-slate-400">Panel de Administración</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <Plus size={20} /> Nueva Empresa
          </button>
        </div>

        {/* Formulario nueva empresa */}
        {showForm && (
          <div className="bg-slate-800 rounded-2xl p-6 mb-6 border border-slate-700">
            <h2 className="text-xl font-semibold mb-4">Configurar Nueva Empresa</h2>
            <p className="text-slate-400 text-sm mb-4">
              El CEO investigará la empresa antes de presentarse al cliente.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Nombre de la empresa *</label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 focus:outline-none focus:border-emerald-500"
                  placeholder="Ej: Distribuidora Solar SA"
                />
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-1">Sitio web (opcional pero recomendado)</label>
                <div className="flex items-center gap-2">
                  <Globe size={20} className="text-slate-500" />
                  <input
                    type="url"
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 focus:outline-none focus:border-emerald-500"
                    placeholder="https://ejemplo.com"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={crearEmpresa}
                disabled={creating || !formData.nombre.trim()}
                className="bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 px-6 py-3 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50"
              >
                {creating ? <Loader2 className="animate-spin" size={18} /> : <Brain size={18} />}
                {creating ? "Investigando..." : "Crear y Preparar CEO"}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-6 py-3 text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Lista de empresas */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Empresas Activas</h2>
          
          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="animate-spin mx-auto text-emerald-400" size={32} />
            </div>
          ) : empresas.length === 0 ? (
            <div className="bg-slate-800/50 rounded-2xl p-12 text-center border border-slate-700">
              <Building2 size={48} className="mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400">No hay empresas configuradas</p>
              <p className="text-slate-500 text-sm">Creá una para empezar</p>
            </div>
          ) : (
            empresas.map((emp) => (
              <div key={emp.id} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-emerald-600 to-blue-600 rounded-lg flex items-center justify-center">
                    <Building2 size={24} />
                  </div>
                  <div>
                    <h3 className="font-semibold">{emp.nombre}</h3>
                    <p className="text-slate-400 text-sm">{emp.rubro || "Rubro por definir"}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => resetEmpresa(emp.id, emp.nombre)}
                    className="bg-red-900/50 hover:bg-red-800 px-3 py-2 rounded-lg flex items-center gap-2 text-sm text-red-300"
                    title="Reiniciar conversación"
                  >
                    🔄 Reset
                  </button>
                  <button
                    onClick={() => copyLink(emp.id)}
                    className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg flex items-center gap-2 text-sm"
                  >
                    {copiedId === emp.id ? <Check size={16} /> : <Copy size={16} />}
                    {copiedId === emp.id ? "Copiado!" : "Copiar Link"}
                  </button>
                  <a
                    href={`/e/${emp.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-lg flex items-center gap-2 text-sm"
                  >
                    <ExternalLink size={16} /> Abrir
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// VISTA CLIENTE (para el dueño de la empresa)
// ============================================
function ClienteView({ empresaId }) {
  const [empresa, setEmpresa] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Cargar empresa y saludo inicial
  useEffect(() => {
    initChat();
  }, [empresaId]);

  const initChat = async () => {
    try {
      const res = await fetch(`/.netlify/functions/init-cliente?empresa_id=${empresaId}`);
      if (res.ok) {
        const data = await res.json();
        setEmpresa(data.empresa);
        
        // Si hay mensajes guardados, cargarlos
        if (data.mensajes && data.mensajes.length > 0) {
          setMessages(data.mensajes);
        } else if (data.saludo) {
          // Si no hay mensajes, mostrar saludo inicial
          setMessages([{ role: "assistant", content: data.saludo }]);
        }
      } else {
        setMessages([{ role: "assistant", content: "Hmm, no encontré la configuración de esta empresa. ¿El link es correcto?" }]);
      }
    } catch (err) {
      console.error(err);
      setMessages([{ role: "assistant", content: "Error al conectar. Intentá recargar la página." }]);
    }
    setLoading(false);
  };

  // Enviar mensaje
  const handleSendMessage = async () => {
    if ((!inputValue.trim() && !pendingFile) || sending) return;

    const userMessage = inputValue;
    setInputValue("");
    setSending(true);

    // Mostrar mensaje del usuario
    if (pendingFile) {
      setMessages(prev => [...prev, { 
        role: "user", 
        content: userMessage || "Adjunté un archivo",
        file: { name: pendingFile.name, type: pendingFile.type }
      }]);
    } else {
      setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    }

    try {
      let fileData = null;
      
      if (pendingFile) {
        fileData = await processFile(pendingFile);
        setPendingFile(null);
      }

      const res = await fetch("/.netlify/functions/chat-ceo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaId,
          mensaje: userMessage,
          historial: messages.slice(-10),
          archivo: fileData,
        }),
      });

      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.respuesta }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: "assistant", content: "Perdón, tuve un problema. ¿Podés repetir?" }]);
    }
    setSending(false);
  };

  // Procesar archivo
  const processFile = async (file) => {
    const ext = file.name.split(".").pop().toLowerCase();
    
    if (ext === "csv") {
      return new Promise((resolve) => {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: true,
          complete: (results) => {
            resolve({
              type: "tabular",
              fileName: file.name,
              headers: results.meta.fields,
              rows: results.data.slice(0, 100),
              totalRows: results.data.length,
            });
          },
        });
      });
    } else if (["xlsx", "xls"].includes(ext)) {
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
      return {
        type: "tabular",
        fileName: file.name,
        headers,
        rows: rows.slice(0, 100),
        totalRows: rows.length,
      };
    } else if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
      const base64 = await fileToBase64(file);
      return { type: "image", fileName: file.name, base64, mediaType: file.type };
    } else if (ext === "pdf") {
      const base64 = await fileToBase64(file);
      return { type: "pdf", fileName: file.name, base64 };
    }
    return null;
  };

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) setPendingFile(file);
  };

  const getFileIcon = (type) => {
    if (type?.startsWith("image")) return Image;
    if (type?.includes("pdf")) return FileText;
    return FileSpreadsheet;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin mx-auto text-emerald-400 mb-4" size={48} />
          <p className="text-slate-400">Conectando con tu CEO Virtual...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800/50 border-b border-slate-700 px-6 py-4 flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full flex items-center justify-center">
          <Brain size={20} />
        </div>
        <div>
          <h1 className="font-semibold">CEO Virtual</h1>
          <p className="text-sm text-slate-400">{empresa?.nombre || "Cargando..."}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-2xl px-4 py-3 rounded-2xl ${
              msg.role === "user" 
                ? "bg-emerald-600 text-white" 
                : "bg-slate-800 text-slate-200"
            }`}>
              {msg.file && (
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-600">
                  {(() => { const Icon = getFileIcon(msg.file.type); return <Icon size={16} />; })()}
                  <span className="text-sm">{msg.file.name}</span>
                </div>
              )}
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-slate-800 px-4 py-3 rounded-2xl">
              <Loader2 className="animate-spin text-emerald-400" size={20} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Pending file indicator */}
      {pendingFile && (
        <div className="px-6 pb-2">
          <div className="bg-slate-800 rounded-lg px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {(() => { const Icon = getFileIcon(pendingFile.type); return <Icon size={18} className="text-emerald-400" />; })()}
              <span className="text-sm">{pendingFile.name}</span>
            </div>
            <button onClick={() => setPendingFile(null)} className="text-slate-400 hover:text-white">
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="bg-slate-800/50 border-t border-slate-700 px-6 py-4">
        <div className="flex gap-3 max-w-4xl mx-auto">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-slate-700 hover:bg-slate-600 p-3 rounded-xl"
          >
            <Paperclip size={20} />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".csv,.xlsx,.xls,.pdf,.jpg,.jpeg,.png,.gif,.webp"
            className="hidden"
          />
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
            disabled={sending || (!inputValue.trim() && !pendingFile)}
            className="bg-emerald-600 hover:bg-emerald-500 px-6 rounded-xl disabled:opacity-50"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}