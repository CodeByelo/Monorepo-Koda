import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  CheckCircle2, 
  Database,
  Zap,
  Table as TableIcon,
  ShieldCheck
} from 'lucide-react';
import { api } from '@/api/client';

const ImportStatement = () => {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | ''>('');
  const [selectedProfile, setSelectedProfile] = useState('Manual (Nuevo)');
  const [fileLoaded, setFileLoaded] = useState(false);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('');
  
  // Field column mappings
  const [dateCol, setDateCol] = useState('Columna A (FECHA)');
  const [refCol, setRefCol] = useState('Columna B (REF)');
  const [descCol, setDescCol] = useState('Columna C (CONCEPTO)');
  const [amountCol, setAmountCol] = useState('Columna D (MONTO)');
  
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const profiles = ['Manual (Nuevo)', 'Banesco Corp', 'Mercantil Pyme', 'Bancamiga FX'];

  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [columns, setColumns] = useState<string[]>([
    'Columna A (FECHA)',
    'Columna B (REF)',
    'Columna C (CONCEPTO)',
    'Columna D (MONTO)'
  ]);

  const fetchAccounts = async () => {
    try {
      const res = await api.get<any[]>('/tesoreria/cuentas');
      setAccounts(res);
      if (res.length > 0) {
        setSelectedAccountId(res[0].id);
      }
    } catch (error) {
      console.error("Error fetching accounts:", error);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const triggerNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  const handleSimulateFile = (profile: string) => {
    setFileName(`extracto_${profile.toLowerCase().replace(' ', '_')}_bcv.csv`);
    setFileSize("12 KB");
    setRawRows([]);
    setFileLoaded(true);
    
    const simCols = [
      'Columna A (FECHA)',
      'Columna B (REF)',
      'Columna C (CONCEPTO)',
      'Columna D (MONTO)',
      'Columna A (TRANS_ID)',
      'Columna B (DATE_VAL)',
      'Columna C (VALUE_BS)',
      'Columna D (GL_DESC)'
    ];
    setColumns(simCols);

    if (profile === 'Banesco Corp') {
      setDateCol('Columna A (FECHA)');
      setRefCol('Columna B (REF)');
      setDescCol('Columna C (CONCEPTO)');
      setAmountCol('Columna D (MONTO)');
    } else if (profile === 'Mercantil Pyme') {
      setDateCol('Columna B (DATE_VAL)');
      setRefCol('Columna A (TRANS_ID)');
      setDescCol('Columna D (GL_DESC)');
      setAmountCol('Columna C (VALUE_BS)');
    } else {
      setDateCol('Columna A (FECHA)');
      setRefCol('Columna C (REFERENCIA)');
      setDescCol('Columna B (DESCRIPCION)');
      setAmountCol('Columna D (MONTO)');
    }

    setPreviewData([
      { date: '2026-06-15', ref: 'REF-98382', concept: 'PAGO MOVIL RECIBIDO - INVERSIONES EL FARO', amount: 'Bs. 12,500.00', num: 12500.0 },
      { date: '2026-06-16', ref: 'REF-10492', concept: 'TRANSFERENCIA ENVIADA - ALCABALA SENIAT', amount: '-Bs. 45,000.00', num: -45000.0 },
      { date: '2026-06-18', ref: 'REF-33291', concept: 'COBRO DE FACTURA COMERCIAL - TECHCORP', amount: 'Bs. 85,300.00', num: 85300.0 }
    ]);
    triggerNotification(`Perfil ${profile} cargado con datos simulados del extracto.`);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setFileName(file.name);
      setFileSize(`${(file.size / 1024).toFixed(1)} KB`);
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const lines = text.split(/\r?\n/).map(line => {
          const delimiter = line.includes(';') ? ';' : ',';
          return line.split(delimiter).map(cell => cell.replace(/^["']|["']$/g, '').trim());
        }).filter(line => line.length > 0 && line.some(cell => cell !== ''));
        
        if (lines.length > 0) {
          setRawRows(lines);
          const firstRow = lines[0];
          const newCols = firstRow.map((cell, idx) => cell || `Columna ${String.fromCharCode(65 + idx)}`);
          setColumns(newCols);
          
          setDateCol(newCols[0] || '');
          setRefCol(newCols[1] || (newCols[0] || ''));
          setDescCol(newCols[2] || (newCols[0] || ''));
          setAmountCol(newCols[3] || (newCols[0] || ''));
          
          setFileLoaded(true);
          triggerNotification(`Archivo ${file.name} cargado con éxito. Mapee las columnas.`);
        } else {
          triggerNotification("El archivo CSV está vacío.");
        }
      };
      reader.readAsText(file);
    }
  };

  const handleProfileSelect = (p: string) => {
    setSelectedProfile(p);
    if (p === 'Manual (Nuevo)') return;

    if (fileLoaded && rawRows.length > 0) {
      const firstRow = rawRows[0] || [];
      if (p === 'Banesco Corp') {
        const dCol = firstRow.find(h => h.toUpperCase().includes('FECHA')) || firstRow[0] || '';
        const rCol = firstRow.find(h => h.toUpperCase().includes('REF')) || firstRow[1] || '';
        const cCol = firstRow.find(h => h.toUpperCase().includes('CONCEPTO')) || firstRow[2] || '';
        const aCol = firstRow.find(h => h.toUpperCase().includes('MONTO')) || firstRow[3] || '';
        setDateCol(dCol); setRefCol(rCol); setDescCol(cCol); setAmountCol(aCol);
      } else if (p === 'Mercantil Pyme') {
        const dCol = firstRow.find(h => h.toUpperCase().includes('DATE_VAL') || h.toUpperCase().includes('FECHA')) || firstRow[1] || '';
        const rCol = firstRow.find(h => h.toUpperCase().includes('TRANS_ID') || h.toUpperCase().includes('REF')) || firstRow[0] || '';
        const cCol = firstRow.find(h => h.toUpperCase().includes('GL_DESC') || h.toUpperCase().includes('CONCEPTO')) || firstRow[3] || '';
        const aCol = firstRow.find(h => h.toUpperCase().includes('VALUE_BS') || h.toUpperCase().includes('MONTO')) || firstRow[2] || '';
        setDateCol(dCol); setRefCol(rCol); setDescCol(cCol); setAmountCol(aCol);
      } else {
        const dCol = firstRow.find(h => h.toUpperCase().includes('FECHA')) || firstRow[0] || '';
        const rCol = firstRow.find(h => h.toUpperCase().includes('REFERENCIA')) || firstRow[2] || '';
        const cCol = firstRow.find(h => h.toUpperCase().includes('DESCRIPCION')) || firstRow[1] || '';
        const aCol = firstRow.find(h => h.toUpperCase().includes('MONTO')) || firstRow[3] || '';
        setDateCol(dCol); setRefCol(rCol); setDescCol(cCol); setAmountCol(aCol);
      }
      triggerNotification(`Perfil ${p} aplicado al archivo actual.`);
    } else {
      handleSimulateFile(p);
    }
  };

  useEffect(() => {
    if (rawRows.length === 0) return;
    
    const dateIdx = columns.indexOf(dateCol);
    const refIdx = columns.indexOf(refCol);
    const descIdx = columns.indexOf(descCol);
    const amountIdx = columns.indexOf(amountCol);

    if (dateIdx === -1 || refIdx === -1 || descIdx === -1 || amountIdx === -1) return;

    const firstRowAmount = rawRows[0]?.[amountIdx] || '';
    const hasHeader = isNaN(Number(firstRowAmount.replace(/[^0-9.-]/g, '')));
    const dataRows = hasHeader ? rawRows.slice(1) : rawRows;

    const mapped = dataRows.map(row => {
      const dateVal = row[dateIdx] || '';
      const refVal = row[refIdx] || '';
      const descVal = row[descIdx] || '';
      const amountStr = row[amountIdx] || '0';
      const numVal = parseFloat(amountStr.replace(/[^0-9.-]/g, '')) || 0;
      
      return {
        date: dateVal,
        ref: refVal,
        concept: descVal,
        amount: numVal >= 0 ? `Bs. ${numVal.toLocaleString()}` : `-Bs. ${Math.abs(numVal).toLocaleString()}`,
        num: numVal
      };
    }).filter(row => row.date && row.concept);

    setPreviewData(mapped);
  }, [rawRows, columns, dateCol, refCol, descCol, amountCol]);

  const handleImport = async () => {
    if (!selectedAccountId) {
      triggerNotification("Seleccione una cuenta bancaria de destino.");
      return;
    }
    
    if (previewData.length === 0) {
      triggerNotification("Cargue o simule un extracto bancario primero.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await api.post<any>('/tesoreria/importar', {
        cuenta_id: selectedAccountId,
        movimientos: previewData.map(d => ({
          fecha: d.date,
          referencia: d.ref,
          concepto: d.concept,
          monto: d.num
        }))
      });

      if (response.ok) {
        triggerNotification(`¡Éxito! Se importaron ${response.count} movimientos en la cuenta.`);
        setFileLoaded(false);
        setPreviewData([]);
        setFileName('');
        setRawRows([]);
        fetchAccounts(); // Update balance indicators
      } else {
        triggerNotification(response.message || "Error al procesar el archivo extracto.");
      }
    } catch (error) {
      console.error("Error importing statement:", error);
      triggerNotification("Error de red o de servidor al importar.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-500 pb-20">
      {/* Toast Notification */}
      {notification && createPortal(
        <div className="fixed top-5 right-5 bg-slate-900 text-white px-6 py-4 rounded-xl shadow-2xl z-50 flex items-center gap-3 border border-slate-700 animate-in slide-in-from-top-5 duration-300">
           <ShieldCheck className="text-green-400 shrink-0" size={18} />
           <p className="text-xs font-black uppercase tracking-wider text-white">{notification}</p>
        </div>,
        document.body
      )}

      {/* Header */}
      <header className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Tesorería &gt; Inteligencia de Datos
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase">Importador de Estados</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Carga y mapeo dinámico de extractos bancarios para conciliación masiva.</p>
          </div>
          <div className="flex gap-3 animate-in fade-in-50">
             <button 
               onClick={handleImport}
               disabled={!fileLoaded || isSubmitting}
               className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 transition-all shadow-lg ${
                 !fileLoaded || isSubmitting
                   ? 'bg-white text-slate-400 cursor-not-allowed shadow-none border border-slate-200' 
                   : 'bg-[#0b5156] text-white shadow-green-900/20 hover:bg-[#083a3d]'
               }`}
             >
                <Zap size={14} className={isSubmitting ? 'animate-pulse' : ''} />
                {isSubmitting ? 'Importando...' : 'Procesar e Importar'}
             </button>
          </div>
        </div>
      </header>

      {/* Step 1: Target Account & Profile Selection */}
      <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-2 border-b border-slate-100">
           <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest block">1. Cuenta Destino</label>
              <select 
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-black text-[#0b5156] outline-none focus:border-[#0b5156] uppercase"
              >
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.banco} ({(acc.numero_cuenta || '????').slice(-4)}) — Bal: ${(acc.saldo || 0).toLocaleString()}
                  </option>
                ))}
                {accounts.length === 0 && <option value="">Cargando cuentas...</option>}
              </select>
           </div>
           
           <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest block">2. Perfil Bancario</label>
              <div className="flex flex-wrap gap-2">
                 {profiles.map(p => (
                   <button 
                     key={p} 
                     type="button"
                     onClick={() => handleProfileSelect(p)}
                     className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                       selectedProfile === p ? 'bg-[#0b5156] text-white border-[#0b5156] shadow-md' : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-white'
                     }`}
                   >
                     {p}
                   </button>
                 ))}
              </div>
           </div>
        </div>

        {/* Dropzone area */}
        <div 
          onClick={() => document.getElementById('csv-file-input')?.click()}
          className={`border-4 border-dashed rounded-[32px] p-12 text-center cursor-pointer transition-all group ${
            fileLoaded ? 'bg-green-50/30 border-green-200' : 'bg-slate-50 border-slate-200 hover:bg-white hover:border-[#0b5156]/20'
          }`}
        >
           <input 
             type="file" 
             id="csv-file-input" 
             accept=".csv" 
             className="hidden" 
             onChange={handleFileChange} 
           />
           <div className="w-16 h-16 bg-white rounded-[20px] shadow-md border border-slate-100 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <Database className={fileLoaded ? 'text-green-600' : 'text-[#0b5156]'} size={28} />
           </div>
           <h3 className="text-sm font-black text-[#0b5156] uppercase tracking-tight">
              {fileLoaded ? 'Archivo detectado y cargado' : 'Arrastre su extracto bancario aquí'}
           </h3>
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">
              {fileLoaded ? `${fileName} (${fileSize})` : 'Haga clic para subir un extracto local'}
           </p>
           {fileLoaded && (
              <div className="mt-3 flex items-center justify-center gap-2 text-green-600">
                 <CheckCircle2 size={14} />
                 <span className="text-[9px] font-black uppercase tracking-widest">Listo para mapear</span>
              </div>
           )}
        </div>
      </article>

      {/* Step 2: Dynamic Mapper */}
      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 items-start transition-all duration-500 ${!fileLoaded ? 'opacity-30 pointer-events-none grayscale blur-[2px]' : ''}`}>
        <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-6">
           <div className="space-y-1">
              <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter flex items-center gap-2">
                 <span className="flex items-center justify-center w-6 h-6 bg-[#0b5156] text-white rounded-lg text-[10px]">2</span>
                 Mapeo de Columnas
              </h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Defina qué columna del archivo corresponde a cada campo.</p>
           </div>

           <div className="space-y-3">
              {[
                { label: 'Fecha de Operación', icon: '📅', value: dateCol, setter: setDateCol },
                { label: 'Referencia / Lote', icon: '🔑', value: refCol, setter: setRefCol },
                { label: 'Descripción / Concepto', icon: '📝', value: descCol, setter: setDescCol },
                { label: 'Monto (Débito/Crédito)', icon: '💰', value: amountCol, setter: setAmountCol },
              ].map((map, i) => (
                <div key={i} className="flex flex-col md:flex-row justify-between items-start md:items-center p-3.5 bg-slate-50 rounded-xl border border-slate-100 gap-4">
                   <div className="flex items-center gap-3">
                      <span className="text-base">{map.icon}</span>
                      <strong className="text-xs font-black text-slate-500 uppercase tracking-tight">{map.label}</strong>
                   </div>
                   <select 
                     value={map.value}
                     onChange={(e) => map.setter(e.target.value)}
                     className="w-full md:w-48 bg-white border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-black text-[#0b5156] outline-none focus:border-[#0b5156] uppercase font-mono"
                   >
                     {columns.map(col => (
                       <option key={col} value={col}>{col}</option>
                     ))}
                   </select>
                </div>
              ))}
           </div>
        </article>

        <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
           <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
              <div className="space-y-1">
                 <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter flex items-center gap-2">
                   Vista Previa de Datos
                 </h2>
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Registros mapeados de extracto.</p>
              </div>
              <TableIcon size={20} className="text-slate-300" />
           </div>

           <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left font-mono">
                 <thead>
                    <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-white">
                       <th className="py-4 px-6">FECHA</th>
                       <th className="py-2.5 px-4 text-center">REFERENCIA</th>
                       <th className="py-2.5 px-4">CONCEPTO</th>
                       <th className="py-4 px-6 text-right">MONTO</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50 text-[11px]">
                    {previewData.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 px-6 font-bold text-slate-400 whitespace-nowrap">{row.date}</td>
                        <td className="py-2.5 px-4 text-center font-black text-[#0b5156] uppercase">{row.ref}</td>
                        <td className="py-2.5 px-4 text-slate-500 max-w-[150px] truncate uppercase font-bold">{row.concept}</td>
                        <td className={`py-4 px-6 text-right font-black ${row.amount.startsWith('-') ? 'text-red-600' : 'text-green-600'}`}>
                           {row.amount}
                        </td>
                      </tr>
                    ))}
                 </tbody>
              </table>
           </div>

           <div className="p-6 bg-[#0b5156]/5 border-t border-[#0b5156]/10 m-6 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-[#0b5156]">
                 <CheckCircle2 size={14} />
                 <span className="text-[10px] font-black uppercase tracking-widest">Validación de Formato Exitosa</span>
              </div>
              <p className="text-[9px] font-bold text-[#0b5156]/60 uppercase leading-relaxed normal-case">
                Formato de fecha detectado: YYYY-MM-DD • Separador decimal: Punto (.) • Codificación: UTF-8. No se detectaron errores estructurales en las filas mapeadas.
              </p>
           </div>
        </article>
      </div>
    </div>
  );
};

export default ImportStatement;
