const LS = {
  formulas: "pvcPro.formulas.v3",
  raw: "pvcPro.rawMaterials.v3",
  log: "pvcPro.priceLog.v2",
  password: "pvcPro.password.v1",
  cloud: "pvcPro.cloudSync.v1",
  meta: "pvcPro.syncMeta.v1",
  device: "pvcPro.deviceId.v1"
};

const money = new Intl.NumberFormat("ar-EG", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const state = {
  formulas: {},
  raw: {},
  currentIngredients: [],
  suppressSync: false,
  cloud: {enabled:false, connecting:false, db:null, docRef:null, unsubscribe:null, settings:null}
};

function num(v, fallback=0){
  const n = Number(String(v ?? "").replace(/,/g,"").trim());
  return Number.isFinite(n) ? n : fallback;
}
function norm(s){ return String(s||"").trim().replace(/\s+/g," ").toLowerCase(); }
function rawKey(name, category=""){ return `${norm(category)}||${norm(name)}`; }
function fmt(n){ return money.format(num(n)); }
function fixed2(n){ return num(n).toFixed(2); }
function today(){ return new Date().toISOString().slice(0,10); }

function seed(){
  const savedV3 = localStorage.getItem(LS.formulas);
  state.formulas = savedV3 ? JSON.parse(savedV3) : structuredClone(window.INITIAL_FORMULAS || {});

  const rawSavedV3 = localStorage.getItem(LS.raw);
  if(rawSavedV3){
    state.raw = JSON.parse(rawSavedV3);
  } else {
    state.raw = {};
    (window.INITIAL_RAW || []).forEach(r => {
      if(r.name) state.raw[rawKey(r.name, r.category || "")] = {
        name: r.name,
        category: r.category || "",
        price: num(r.price),
        updatedAt: r.updatedAt || today(),
        source: r.source || "initial raw material list"
      };
    });
    Object.values(state.formulas).forEach(f => (f.ingredients||[]).forEach(i => {
      if(i.name && !getRawRecord(i.name, i.category || "")){
        const category = i.category || "";
        state.raw[rawKey(i.name, category)] = {name:i.name, category, price:num(i.price), updatedAt: today(), source:"initial formula"};
      }
    }));
    saveRaw();
  }
  populateFormulaSelects();
  const first = Object.keys(state.formulas)[0];
  if(first) loadFormula(first); else newFormula();
}

function migrateRaw(oldRaw){
  const migrated = {};
  Object.values(oldRaw || {}).forEach(r=>{
    if(!r || !r.name) return;
    const category = r.category || "";
    migrated[rawKey(r.name, category)] = {...r, category};
  });
  return migrated;
}

function saveFormulas(){
  localStorage.setItem(LS.formulas, JSON.stringify(state.formulas));
  populateFormulaSelects();
  if(!state.suppressSync) markLocalChanged("formulas");
}
function saveRaw(){
  localStorage.setItem(LS.raw, JSON.stringify(state.raw));
  refreshRawPickers();
  if(!state.suppressSync) markLocalChanged("rawMaterials");
}

function populateFormulaSelects(){
  const names = Object.keys(state.formulas).sort((a,b)=>{
    const ta = state.formulas[a]?.formulaType || "Other";
    const tb = state.formulas[b]?.formulaType || "Other";
    return ta.localeCompare(tb) || a.localeCompare(b);
  });
  const groups = {};
  names.forEach(n=>{
    const t = state.formulas[n]?.formulaType || "Other";
    if(!groups[t]) groups[t] = [];
    groups[t].push(n);
  });
  const html = Object.entries(groups).map(([g, arr])=>`<optgroup label="${escapeHtml(g)}">` +
    arr.map(n=>`<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("") + `</optgroup>`).join("");
  ["formulaSelect","compareA","compareB"].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    const current = el.value;
    el.innerHTML = html;
    if(names.includes(current)) el.value = current;
  });
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function getCategories(){
  return [...new Set(Object.values(state.raw).map(r=>String(r.category||"").trim()).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b));
}
function getMaterials(category=""){
  return Object.values(state.raw)
    .filter(r => !category || norm(r.category) === norm(category))
    .sort((a,b)=>String(a.name).localeCompare(String(b.name)) || String(a.category||"").localeCompare(String(b.category||"")));
}
function getRawRecord(name, category=""){
  if(!name) return null;
  const exact = state.raw[rawKey(name, category)];
  if(exact) return exact;
  // Legacy or no-category fallback.
  return Object.values(state.raw).find(r=>norm(r.name)===norm(name) && (!category || norm(r.category)===norm(category))) ||
         Object.values(state.raw).find(r=>norm(r.name)===norm(name)) || null;
}
function getRawPrice(name, fallback=0, category=""){
  const rec = getRawRecord(name, category);
  return rec && Number.isFinite(Number(rec.price)) ? Number(rec.price) : num(fallback);
}
function getRawCategory(name, fallback=""){
  const rec = getRawRecord(name, "");
  return rec?.category || fallback || "";
}

function loadFormula(name){
  const f = state.formulas[name];
  if(!f) return;
  document.getElementById("formulaSelect").value = name;
  document.getElementById("mixName").value = f.mixName || name;
  document.getElementById("batchKg").value = num(f.batchKg,100);
  document.getElementById("wastePct").value = num(f.depreciation ?? f.wastePct,1.5);
  document.getElementById("mfgCost").value = num(f.mfgCost,5000);
  document.getElementById("packingCost").value = num(f.packingCost,0);
  document.getElementById("transportCost").value = num(f.transportCost,0);
  document.getElementById("financeCost").value = num(f.financeCost,0);
  document.getElementById("marginPct").value = num(f.margin,0);
  state.currentIngredients = (f.ingredients||[]).map(i=>{
    const category = i.category || getRawCategory(i.name, "");
    return {category, name:i.name||"", phr:num(i.phr), price:num(getRawPrice(i.name, i.price, category))};
  });
  renderIngredients();
}

function newFormula(){
  document.getElementById("mixName").value = "";
  document.getElementById("batchKg").value = 100;
  document.getElementById("wastePct").value = 1.5;
  document.getElementById("mfgCost").value = 5000;
  document.getElementById("packingCost").value = 0;
  document.getElementById("transportCost").value = 0;
  document.getElementById("financeCost").value = 0;
  document.getElementById("marginPct").value = 0;
  const first = getMaterials()[0];
  state.currentIngredients = [{category:first?.category||"", name:first?.name||"", phr:0, price:num(first?.price,0)}];
  renderIngredients();
}

function renderIngredients(){
  const tbody = document.querySelector("#ingredientsTable tbody");
  tbody.innerHTML = "";
  state.currentIngredients.forEach((ing, idx)=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="sensitive"><select class="categorySelect" data-i="${idx}" data-k="category">${categoryOptions(ing.category)}</select></td>
      <td class="sensitive"><select class="materialSelect" data-i="${idx}" data-k="name">${materialOptions(ing.category, ing.name)}</select></td>
      <td class="sensitive"><input data-i="${idx}" data-k="phr" type="number" step="0.001" value="${num(ing.phr)}"></td>
      <td class="sensitive kgCell">0</td>
      <td class="sensitive"><input data-i="${idx}" data-k="price" type="number" step="0.01" value="${fixed2(ing.price)}"></td>
      <td class="sensitive costCell">0</td>
      <td class="alertCell"></td>
      <td><button class="danger small" data-remove="${idx}">حذف</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll("input,select").forEach(inp=>inp.addEventListener("input", onIngredientChange));
  tbody.querySelectorAll("select").forEach(inp=>inp.addEventListener("change", onIngredientChange));
  tbody.querySelectorAll("[data-remove]").forEach(btn=>btn.addEventListener("click", e=>{
    state.currentIngredients.splice(Number(e.currentTarget.dataset.remove),1); renderIngredients();
  }));
  calculate();
}

function categoryOptions(current=""){
  const cats = getCategories();
  const all = current && !cats.some(c=>norm(c)===norm(current)) ? [current, ...cats] : cats;
  return `<option value="">بدون تصنيف / كل الخامات</option>` + all.map(c=>`<option value="${escapeHtml(c)}" ${norm(c)===norm(current)?"selected":""}>${escapeHtml(c)}</option>`).join("");
}
function materialOptions(category="", current=""){
  const materials = getMaterials(category);
  const hasCurrent = current && materials.some(r=>norm(r.name)===norm(current));
  const rows = hasCurrent || !current ? materials : [{name:current, category, price:""}, ...materials];
  const opts = rows.map(r=>{
    const label = r.category ? `${r.name} — ${r.category}` : r.name;
    return `<option value="${escapeHtml(r.name)}" ${norm(r.name)===norm(current)?"selected":""}>${escapeHtml(label)}</option>`;
  }).join("");
  return `<option value="">اختر الخامة</option>` + opts;
}
function refreshRawPickers(){
  document.querySelectorAll(".categorySelect").forEach(sel=>{
    const idx = Number(sel.dataset.i);
    if(state.currentIngredients[idx]) sel.innerHTML = categoryOptions(state.currentIngredients[idx].category);
  });
  document.querySelectorAll(".materialSelect").forEach(sel=>{
    const idx = Number(sel.dataset.i);
    if(state.currentIngredients[idx]) sel.innerHTML = materialOptions(state.currentIngredients[idx].category, state.currentIngredients[idx].name);
  });
}

function onIngredientChange(e){
  const i = Number(e.target.dataset.i), k = e.target.dataset.k;
  let v = e.target.value;
  if(k === "phr" || k === "price") v = num(v);
  state.currentIngredients[i][k] = v;
  if(k === "category"){
    const materials = getMaterials(v);
    const current = state.currentIngredients[i].name;
    const stillAvailable = materials.some(r=>norm(r.name)===norm(current));
    if(!stillAvailable){
      const first = materials[0];
      state.currentIngredients[i].name = first?.name || "";
      state.currentIngredients[i].price = num(first?.price, 0);
    } else {
      const rec = getRawRecord(current, v);
      if(rec) state.currentIngredients[i].price = num(rec.price);
    }
    renderIngredients();
  } else if(k === "name"){
    const rec = getRawRecord(v, state.currentIngredients[i].category);
    if(rec){
      state.currentIngredients[i].category = rec.category || state.currentIngredients[i].category || "";
      state.currentIngredients[i].price = num(rec.price);
    }
    renderIngredients();
  } else {
    calculate();
  }
}

function getInputs(){
  return {
    mixName: document.getElementById("mixName").value.trim(),
    batchKg: num(document.getElementById("batchKg").value,100),
    wastePct: num(document.getElementById("wastePct").value,0),
    mfgCost: num(document.getElementById("mfgCost").value,0),
    packingCost: num(document.getElementById("packingCost").value,0),
    transportCost: num(document.getElementById("transportCost").value,0),
    financeCost: num(document.getElementById("financeCost").value,0),
    marginPct: num(document.getElementById("marginPct").value,0),
    viewMode: document.getElementById("viewMode").value
  };
}

function calculate(){
  const inp = getInputs();
  const totalPhr = state.currentIngredients.reduce((s,i)=>s+num(i.phr),0);
  let totalCost = 0;
  document.querySelectorAll("#ingredientsTable tbody tr").forEach((tr,idx)=>{
    const ing = state.currentIngredients[idx];
    const kg = totalPhr > 0 ? num(ing.phr)/totalPhr*inp.batchKg : 0;
    const rawRec = getRawRecord(ing.name, ing.category);
    const price = num(ing.price, getRawPrice(ing.name,0,ing.category));
    const cost = kg * price;
    totalCost += cost;
    tr.querySelector(".kgCell").textContent = fmt(kg);
    tr.querySelector(".costCell").textContent = fmt(cost);
    const alert = tr.querySelector(".alertCell");
    alert.innerHTML = rawRec ? `<span class="ok">OK</span>` : `<span class="warn">غير موجود في ملف الخامات</span>`;
  });
  const rawKg = inp.batchKg ? totalCost / inp.batchKg : 0;
  const rawTon = rawKg * 1000;
  const afterWaste = inp.wastePct < 100 ? rawTon / (1 - inp.wastePct/100) : rawTon;
  const net = afterWaste + inp.mfgCost + inp.packingCost + inp.transportCost + inp.financeCost;
  const sell = net * (1 + inp.marginPct/100);
  setText("totalPhr", fmt(totalPhr)); setText("totalKg", fmt(inp.batchKg)); setText("totalIngredientCost", fmt(totalCost));
  setText("rawKg", fmt(rawKg)+" ج.م"); setText("rawTon", fmt(rawTon)+" ج.م"); setText("netCostTon", fmt(net)+" ج.م");
  setText("sellTon", fmt(sell)+" ج.م"); setText("sellKg", fmt(sell/1000)+" ج.م");
  renderReport({inp,totalPhr,totalCost,rawKg,rawTon,afterWaste,net,sell});
  renderCustomerScreen({inp,sell});
  document.body.classList.toggle("hidden-sensitive", inp.viewMode === "customer");
}

function setText(id, text){ document.getElementById(id).textContent = text; }

function renderReport(c){
  const showInternal = c.inp.viewMode === "internal";
  const report = document.getElementById("costReport");
  let ingredientsTable = "";
  if(showInternal){
    ingredientsTable = `<div class="report-card sensitive"><h3>تفاصيل المكونات</h3><table class="report-table"><thead><tr><th>التصنيف</th><th>المكون</th><th>PHR</th><th>Kg/Batch</th><th>Price/Kg</th><th>Cost</th></tr></thead><tbody>` +
      state.currentIngredients.map(i=>{
        const kg = c.totalPhr ? num(i.phr)/c.totalPhr*c.inp.batchKg : 0;
        return `<tr><td>${escapeHtml(i.category||"-")}</td><td>${escapeHtml(i.name)}</td><td>${fmt(i.phr)}</td><td>${fmt(kg)}</td><td>${fmt(i.price)}</td><td>${fmt(kg*num(i.price))}</td></tr>`;
      }).join("") + `</tbody></table></div>`;
  }
  report.innerHTML = `
    <div class="report-grid">
      <div class="report-card">
        <h3>${showInternal ? "ملخص التكلفة الداخلي" : "عرض سعر مبدئي للعميل"}</h3>
        <table class="report-table">
          <tbody>
            <tr><td>اسم الخلطة</td><td>${escapeHtml(c.inp.mixName || "-")}</td></tr>
            ${showInternal ? `<tr><td>Raw Material / Ton</td><td>${fmt(c.rawTon)} ج.م</td></tr>
            <tr><td>After Waste</td><td>${fmt(c.afterWaste)} ج.م</td></tr>
            <tr><td>Manufacturing</td><td>${fmt(c.inp.mfgCost)} ج.م</td></tr>
            <tr><td>Packing</td><td>${fmt(c.inp.packingCost)} ج.م</td></tr>
            <tr><td>Transport</td><td>${fmt(c.inp.transportCost)} ج.م</td></tr>
            <tr><td>Finance</td><td>${fmt(c.inp.financeCost)} ج.م</td></tr>
            <tr><td>Net Cost / Ton</td><td>${fmt(c.net)} ج.م</td></tr>` : ""}
            <tr><td><strong>Selling Price / Ton</strong></td><td><strong>${fmt(c.sell)} ج.م</strong></td></tr>
            <tr><td><strong>Selling Price / Kg</strong></td><td><strong>${fmt(c.sell/1000)} ج.م</strong></td></tr>
          </tbody>
        </table>
      </div>
      ${ingredientsTable}
    </div>`;
}

function renderCustomerScreen(c){
  const box = document.getElementById("customerScreen");
  if(!box) return;
  const productName = c.inp.mixName || "-";
  const sellKg = c.sell / 1000;
  box.innerHTML = `
    <div class="customer-quote-card">
      <div class="quote-head">
        <div>
          <h3>عرض سعر للعميل</h3>
        </div>
        <div class="quote-date">${new Date().toLocaleDateString("ar-EG")}</div>
      </div>
      <table class="customer-price-table">
        <thead>
          <tr><th>اسم الخامة</th><th>سعر البيع / كجم</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>${escapeHtml(productName)}</strong></td>
            <td><strong>${fmt(sellKg)} ج.م</strong></td>
          </tr>
        </tbody>
      </table>
      <div class="customer-note">الأسعار استرشادية وقابلة للتأكيد النهائي طبقًا لشروط التوريد والكمية ومدة صلاحية العرض.</div>
    </div>`;
}

function sanitizeFilename(name){
  return String(name || "PVC-Quote")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120) || "PVC-Quote";
}

function printCustomerQuote(){
  const inp = getInputs();
  const oldTitle = document.title;
  document.title = sanitizeFilename(inp.mixName || "PVC-Quote");
  document.body.classList.add("print-customer");
  window.print();
  setTimeout(()=>{ document.title = oldTitle; }, 1200);
}

function copyCustomerQuote(){
  const inp = getInputs();
  const totalPhr = state.currentIngredients.reduce((s,i)=>s+num(i.phr),0);
  const totalCost = state.currentIngredients.reduce((s,i)=>{
    const kg = totalPhr ? num(i.phr)/totalPhr*inp.batchKg : 0;
    return s + kg*num(i.price);
  },0);
  const rawTon = inp.batchKg ? totalCost/inp.batchKg*1000 : 0;
  const afterWaste = inp.wastePct < 100 ? rawTon/(1-inp.wastePct/100) : rawTon;
  const net = afterWaste + inp.mfgCost + inp.packingCost + inp.transportCost + inp.financeCost;
  const sell = net * (1 + inp.marginPct/100);
  const text = `اسم الخامة: ${inp.mixName || "-"}\nسعر البيع / كجم: ${fmt(sell/1000)} ج.م`;
  navigator.clipboard?.writeText(text).then(()=>alert("تم نسخ عرض العميل"),()=>alert(text));
}

function saveCurrent(){
  const inp = getInputs();
  if(!inp.mixName){ alert("برجاء إدخال اسم الخلطة"); return; }
  state.formulas[inp.mixName] = {
    mixName: inp.mixName,
    formulaType: state.formulas[document.getElementById("formulaSelect").value]?.formulaType || "Other",
    batchKg: String(inp.batchKg),
    depreciation: String(inp.wastePct),
    mfgCost: String(inp.mfgCost),
    packingCost: String(inp.packingCost),
    transportCost: String(inp.transportCost),
    financeCost: String(inp.financeCost),
    margin: String(inp.marginPct),
    ingredients: state.currentIngredients.map(i=>({category:i.category||"", name:i.name, phr:String(num(i.phr)), price:String(num(i.price))})),
    updatedAt: new Date().toLocaleString("ar-EG")
  };
  saveFormulas();
  document.getElementById("formulaSelect").value = inp.mixName;
  alert("تم حفظ الخلطة");
}

async function importExcel(file){
  const data = await file.arrayBuffer();
  let rows = [];
  if(file.name.toLowerCase().endsWith(".csv")){
    const text = new TextDecoder("utf-8").decode(data);
    rows = text.split(/\r?\n/).filter(Boolean).map(line=>line.split(",").map(x=>x.trim()));
  }else{
    if(!window.XLSX){ alert("مكتبة قراءة Excel لم يتم تحميلها. تأكد من الاتصال بالإنترنت أو استخدم CSV."); return; }
    const wb = XLSX.read(data, {type:"array"});
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:""});
  }
  const header = (rows[0]||[]).map(h=>norm(h));
  const nameIdx = findHeader(header, ["material name","material","raw material","name","الخامة","اسم الخام","اسم الخامة"]);
  const categoryIdx = findHeader(header, ["category","classification","type","group","تصنيف","التصنيف","نوع الخام"]);
  const priceIdx = findHeader(header, ["price egp/kg","price egp per kg","egp/kg","price","unit price","السعر","سعر الكجم"]);
  if(nameIdx < 0 || priceIdx < 0){ alert("لم يتم العثور على أعمدة Material Name و Price EGP/Kg"); return; }
  let updated = 0, added = 0;
  const touchedCategories = new Set();
  const log = getLog();
  for(let r=1; r<rows.length; r++){
    const name = String(rows[r][nameIdx]||"").trim();
    const category = categoryIdx >= 0 ? String(rows[r][categoryIdx]||"").trim() : "";
    const price = num(rows[r][priceIdx], NaN);
    if(!name || !Number.isFinite(price)) continue;
    const key = rawKey(name, category);
    const old = state.raw[key]?.price;
    if(state.raw[key]) updated++; else added++;
    state.raw[key] = {...state.raw[key], name, category, price, updatedAt: today(), source:file.name};
    if(category) touchedCategories.add(category);
    if(old !== price){
      log.push({date:new Date().toISOString(), material:name, category, oldPrice:old ?? "", newPrice:price, source:file.name});
    }
  }
  localStorage.setItem(LS.log, JSON.stringify(log.slice(-1000)));
  saveRaw();
  state.currentIngredients.forEach(i=>{ const rec=getRawRecord(i.name, i.category); if(rec){ i.category=rec.category||i.category; i.price=num(rec.price); } });
  renderIngredients();
  document.getElementById("importSummary").textContent = `تم تحديث ${updated} خامة وإضافة ${added} خامة من الملف، وتم تحميل ${touchedCategories.size} تصنيف.`;
}

function findHeader(header, aliases){
  const normalizedAliases = aliases.map(norm);
  return header.findIndex(h => normalizedAliases.includes(h));
}
function getLog(){ return JSON.parse(localStorage.getItem(LS.log) || localStorage.getItem("pvcPro.priceLog.v1") || "[]"); }

function compare(){
  const a = document.getElementById("compareA").value, b = document.getElementById("compareB").value;
  if(!a || !b || !state.formulas[a] || !state.formulas[b]) return;
  const ca = calcFormula(state.formulas[a]), cb = calcFormula(state.formulas[b]);
  document.getElementById("compareResult").innerHTML = `
  <table><thead><tr><th>البند</th><th>${escapeHtml(a)}</th><th>${escapeHtml(b)}</th><th>الفرق</th></tr></thead>
  <tbody>
    <tr><td>Raw / Ton</td><td>${fmt(ca.rawTon)}</td><td>${fmt(cb.rawTon)}</td><td>${fmt(cb.rawTon-ca.rawTon)}</td></tr>
    <tr><td>Net Cost / Ton</td><td>${fmt(ca.net)}</td><td>${fmt(cb.net)}</td><td>${fmt(cb.net-ca.net)}</td></tr>
    <tr><td>Selling / Ton</td><td>${fmt(ca.sell)}</td><td>${fmt(cb.sell)}</td><td>${fmt(cb.sell-ca.sell)}</td></tr>
    <tr><td>Total PHR</td><td>${fmt(ca.totalPhr)}</td><td>${fmt(cb.totalPhr)}</td><td>${fmt(cb.totalPhr-ca.totalPhr)}</td></tr>
  </tbody></table>`;
}

function calcFormula(f){
  const batchKg = num(f.batchKg,100), wastePct = num(f.depreciation,0), mfgCost=num(f.mfgCost,0);
  const packingCost=num(f.packingCost,0), transportCost=num(f.transportCost,0), financeCost=num(f.financeCost,0), marginPct=num(f.margin,0);
  const totalPhr=(f.ingredients||[]).reduce((s,i)=>s+num(i.phr),0);
  const totalCost=(f.ingredients||[]).reduce((s,i)=>{
    const kg=totalPhr ? num(i.phr)/totalPhr*batchKg : 0; const price=getRawPrice(i.name,i.price,i.category||"");
    return s + kg*price;
  },0);
  const rawTon=batchKg ? totalCost/batchKg*1000 : 0;
  const afterWaste=wastePct<100 ? rawTon/(1-wastePct/100) : rawTon;
  const net=afterWaste+mfgCost+packingCost+transportCost+financeCost;
  return {totalPhr,rawTon,net,sell:net*(1+marginPct/100)};
}

function exportCsv(filename, rows){
  const csv = rows.map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob(["\ufeff"+csv], {type:"text/csv;charset=utf-8"});
  downloadBlob(filename, blob);
}
function downloadBlob(filename, blob){
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); URL.revokeObjectURL(a.href);
}

async function importFormulaExcel(file){
  const data = await file.arrayBuffer();
  let workbooks = [];
  if(file.name.toLowerCase().endsWith(".csv")){
    const text = new TextDecoder("utf-8").decode(data);
    workbooks = [{name:"PVC Formulas", rows:text.split(/\r?\n/).filter(Boolean).map(line=>line.split(",").map(x=>x.replace(/^"|"$/g,"").trim()))}];
  } else {
    if(!window.XLSX){ alert("مكتبة قراءة Excel لم يتم تحميلها. تأكد من الاتصال بالإنترنت أو استخدم CSV."); return; }
    const wb = XLSX.read(data, {type:"array"});
    workbooks = wb.SheetNames
      .filter(n => norm(n) !== "summary" && !norm(n).includes("instruction"))
      .map(name => ({name, rows:XLSX.utils.sheet_to_json(wb.Sheets[name], {header:1, defval:""})}));
  }
  const formulas = {};
  let rowCount = 0;
  for(const sheet of workbooks){
    const rows = sheet.rows.filter(r => r.some(x => String(x||"").trim() !== ""));
    if(!rows.length) continue;
    const header = rows[0].map(h=>norm(h));
    const typeIdx = findHeader(header, ["formula type","type","formula category","تصنيف الخلطة","نوع الخلطة"]);
    const codeIdx = findHeader(header, ["formula code","formula name","mix name","code","اسم الخلطة","كود الخلطة"]);
    const appIdx = findHeader(header, ["application","التطبيق","الاستخدام"]);
    const batchIdx = findHeader(header, ["batch kg","batch","وزن الباتش"]);
    const wasteIdx = findHeader(header, ["waste %","waste","depreciation","هالك"]);
    const mfgIdx = findHeader(header, ["mfg cost egp/ton","manufacturing","mfg cost","تكلفة التصنيع"]);
    const packIdx = findHeader(header, ["packing egp/ton","packing","تعبئة"]);
    const transIdx = findHeader(header, ["transport egp/ton","transport","نقل"]);
    const finIdx = findHeader(header, ["finance egp/ton","finance","تمويل"]);
    const marginIdx = findHeader(header, ["margin %","margin","هامش"]);
    const catIdx = findHeader(header, ["material category","category","تصنيف الخامة"]);
    const matIdx = findHeader(header, ["material name","material","اسم الخامة"]);
    const origIdx = findHeader(header, ["original material name","original material","الاسم الاصلي"]);
    const phrIdx = findHeader(header, ["phr / qty","phr","qty","qty (kg)","كمية"]);
    const priceIdx = findHeader(header, ["price egp/kg","price","سعر الكجم"]);
    if(codeIdx < 0 || matIdx < 0 || phrIdx < 0) continue;
    for(let r=1; r<rows.length; r++){
      const row = rows[r];
      const code = String(row[codeIdx]||"").trim();
      const mat = String(row[matIdx]||"").trim();
      const phr = num(row[phrIdx], NaN);
      if(!code || !mat || !Number.isFinite(phr)) continue;
      if(!formulas[code]){
        formulas[code] = {
          mixName: code,
          formulaType: typeIdx >= 0 ? String(row[typeIdx]||sheet.name||"Other").trim() : sheet.name,
          application: appIdx >= 0 ? String(row[appIdx]||"").trim() : "",
          batchKg: String(batchIdx >= 0 ? num(row[batchIdx],100) : 100),
          depreciation: String(wasteIdx >= 0 ? num(row[wasteIdx],1.5) : 1.5),
          mfgCost: String(mfgIdx >= 0 ? num(row[mfgIdx],5000) : 5000),
          packingCost: String(packIdx >= 0 ? num(row[packIdx],0) : 0),
          transportCost: String(transIdx >= 0 ? num(row[transIdx],0) : 0),
          financeCost: String(finIdx >= 0 ? num(row[finIdx],0) : 0),
          margin: String(marginIdx >= 0 ? num(row[marginIdx],0) : 0),
          ingredients: [],
          source: file.name,
          updatedAt: new Date().toLocaleString("ar-EG")
        };
      }
      const category = catIdx >= 0 ? String(row[catIdx]||"").trim() : "";
      const rec = getRawRecord(mat, category);
      formulas[code].ingredients.push({
        category: rec?.category || category,
        name: rec?.name || mat,
        originalName: origIdx >= 0 ? String(row[origIdx]||"").trim() : mat,
        phr: String(phr),
        price: String(priceIdx >= 0 ? num(row[priceIdx], rec?.price || 0) : (rec?.price || 0))
      });
      rowCount++;
    }
  }
  const count = Object.keys(formulas).length;
  if(!count){ alert("لم يتم العثور على خلطات صالحة داخل الملف. تأكد من وجود الأعمدة Formula Code و Material Name و PHR / Qty."); return; }
  state.formulas = formulas;
  saveFormulas();
  const first = Object.keys(state.formulas)[0];
  if(first) loadFormula(first);
  document.getElementById("formulaImportSummary").textContent = `تم استيراد ${count} خلطة و ${rowCount} بند خامة من ملف Formula Excel. تم استبدال الخلطات السابقة داخل الحاسبة.`;
}

function exportFormulaExcel(){
  if(!window.XLSX){ alert("مكتبة Excel غير متاحة حاليًا. يمكنك استخدام تصدير Backup JSON بدلًا من ذلك."); return; }
  const rows = [["Formula Type","Formula Code","Application","Batch Kg","Waste %","Mfg Cost EGP/Ton","Packing EGP/Ton","Transport EGP/Ton","Finance EGP/Ton","Margin %","Material Category","Material Name","Original Material Name","PHR / Qty","Price EGP/Kg","Source"]];
  Object.values(state.formulas).forEach(f=>{
    (f.ingredients||[]).forEach(i=>rows.push([
      f.formulaType||"Other", f.mixName, f.application||"", num(f.batchKg,100), num(f.depreciation,1.5), num(f.mfgCost,5000), num(f.packingCost,0), num(f.transportCost,0), num(f.financeCost,0), num(f.margin,0),
      i.category||"", i.name||"", i.originalName||"", num(i.phr), num(i.price), f.source||""
    ]));
  });
  const soft = rows.filter((r,idx)=> idx===0 || norm(r[0]).includes("soft"));
  const rigid = rows.filter((r,idx)=> idx===0 || norm(r[0]).includes("rigid"));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(soft), "PVC Soft Formulas");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rigid), "PVC Rigid Formulas");
  XLSX.writeFile(wb, "pvc-formulas-import.xlsx");
}


function getDeviceId(){
  let id = localStorage.getItem(LS.device);
  if(!id){
    id = "device-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(LS.device, id);
  }
  return id;
}
function getSyncMeta(){
  try { return JSON.parse(localStorage.getItem(LS.meta) || "{}"); } catch { return {}; }
}
function saveSyncMeta(meta){ localStorage.setItem(LS.meta, JSON.stringify(meta || {})); }
function markLocalChanged(reason="local"){
  const meta = getSyncMeta();
  meta.localUpdatedAt = Date.now();
  meta.hasPending = true;
  meta.lastReason = reason;
  saveSyncMeta(meta);
  updateCloudStatus();
  scheduleCloudPush();
}
function snapshotData(){
  return {
    formulas: state.formulas,
    rawMaterials: state.raw,
    priceLog: getLog(),
    exportedAt: new Date().toISOString(),
    appVersion: "v8-cloud-sync"
  };
}
function loadCloudSettings(){
  try { return JSON.parse(localStorage.getItem(LS.cloud) || "{}"); } catch { return {}; }
}
function saveCloudSettings(settings){ localStorage.setItem(LS.cloud, JSON.stringify(settings || {})); }
function getCloudStatusText(){
  const meta = getSyncMeta();
  if(!state.cloud.settings?.firebaseConfig) return "المزامنة السحابية غير مفعلة.";
  if(state.cloud.connecting) return "جاري الاتصال بالسحابة...";
  if(!navigator.onLine) return "Offline: سيتم الحفظ محليًا ثم المزامنة عند عودة الإنترنت.";
  if(!state.cloud.enabled) return "الإعدادات محفوظة، اضغط اتصال / تفعيل المزامنة.";
  if(meta.hasPending) return "متصل - توجد تعديلات محلية قيد الرفع.";
  const last = meta.lastCloudPushAt || meta.lastCloudPullAt;
  return last ? "متصل - آخر مزامنة: " + new Date(last).toLocaleString("ar-EG") : "متصل - جاهز للمزامنة.";
}
function updateCloudStatus(extra=""){
  const el = document.getElementById("cloudStatus");
  if(el) el.textContent = extra || getCloudStatusText();
}
function fillCloudUI(){
  const settings = loadCloudSettings();
  const configEl = document.getElementById("firebaseConfig");
  const syncEl = document.getElementById("cloudSyncId");
  const passEl = document.getElementById("cloudPassphrase");
  if(configEl) configEl.value = settings.firebaseConfig || "";
  if(syncEl) syncEl.value = settings.syncId || "compounder-main";
  if(passEl) passEl.value = settings.passphrase || "";
  updateCloudStatus();
}
function readCloudUISettings(){
  const firebaseConfig = document.getElementById("firebaseConfig")?.value.trim() || "";
  const syncId = (document.getElementById("cloudSyncId")?.value.trim() || "compounder-main").replace(/[^a-zA-Z0-9_-]/g,"-");
  const passphrase = document.getElementById("cloudPassphrase")?.value || "";
  return {firebaseConfig, syncId, passphrase};
}
function parseFirebaseConfig(text){
  if(!text) throw new Error("برجاء إدخال Firebase Config.");
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^const\s+firebaseConfig\s*=\s*/i, "").replace(/^var\s+firebaseConfig\s*=\s*/i, "").replace(/^let\s+firebaseConfig\s*=\s*/i, "").replace(/;\s*$/, "");
  return JSON.parse(cleaned);
}
function b64(bytes){ return btoa(String.fromCharCode(...new Uint8Array(bytes))); }
function fromB64(s){ return Uint8Array.from(atob(s), c=>c.charCodeAt(0)); }
async function deriveCloudKey(passphrase, saltBytes){
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2", salt:saltBytes, iterations:120000, hash:"SHA-256"}, material, {name:"AES-GCM", length:256}, false, ["encrypt","decrypt"]);
}
async function encryptPayload(data, passphrase){
  if(!passphrase || passphrase.length < 6) throw new Error("برجاء إدخال كلمة تشفير لا تقل عن 6 حروف/أرقام.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveCloudKey(passphrase, salt);
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt({name:"AES-GCM", iv}, key, encoded);
  return {encrypted:true, alg:"AES-GCM", salt:b64(salt), iv:b64(iv), data:b64(encrypted)};
}
async function decryptPayload(payload, passphrase){
  if(!payload) return null;
  if(!payload.encrypted) return payload;
  if(!passphrase) throw new Error("لا يمكن قراءة البيانات السحابية بدون كلمة التشفير.");
  const salt = fromB64(payload.salt);
  const iv = fromB64(payload.iv);
  const key = await deriveCloudKey(passphrase, salt);
  const decrypted = await crypto.subtle.decrypt({name:"AES-GCM", iv}, key, fromB64(payload.data));
  return JSON.parse(new TextDecoder().decode(decrypted));
}
let cloudPushTimer = null;
function scheduleCloudPush(){
  if(state.suppressSync) return;
  clearTimeout(cloudPushTimer);
  cloudPushTimer = setTimeout(()=>cloudPush(false), 1200);
}
async function connectCloudSync(showAlerts=false){
  const settings = loadCloudSettings();
  state.cloud.settings = settings;
  if(!settings.firebaseConfig || !settings.syncId) { updateCloudStatus(); return; }
  if(!navigator.onLine){ updateCloudStatus(); return; }
  try{
    state.cloud.connecting = true; updateCloudStatus();
    const config = parseFirebaseConfig(settings.firebaseConfig);
    const appMod = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
    const fsMod = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");
    const appName = "pvc-sync-" + settings.syncId;
    const app = appMod.getApps().find(a=>a.name===appName) || appMod.initializeApp(config, appName);
    const db = fsMod.getFirestore(app);
    const docRef = fsMod.doc(db, "pvcCalculatorSync", settings.syncId);
    state.cloud.db = db; state.cloud.docRef = docRef; state.cloud.enabled = true; state.cloud.fs = fsMod;
    if(state.cloud.unsubscribe) state.cloud.unsubscribe();
    state.cloud.unsubscribe = fsMod.onSnapshot(docRef, snap=>handleCloudSnapshot(snap).catch(err=>updateCloudStatus("خطأ في قراءة السحابة: " + err.message)), err=>updateCloudStatus("خطأ اتصال السحابة: " + err.message));
    updateCloudStatus("تم الاتصال بالسحابة بنجاح.");
    const meta = getSyncMeta();
    if(meta.hasPending) scheduleCloudPush();
    if(showAlerts) alert("تم تفعيل المزامنة السحابية.");
  }catch(err){
    state.cloud.enabled = false;
    updateCloudStatus("تعذر الاتصال بالسحابة: " + err.message);
    if(showAlerts) alert("تعذر الاتصال بالسحابة: " + err.message);
  }finally{
    state.cloud.connecting = false; updateCloudStatus();
  }
}
async function handleCloudSnapshot(snap){
  if(!state.cloud.settings) return;
  if(!snap.exists()){
    const meta = getSyncMeta();
    if(Object.keys(state.formulas||{}).length && !meta.lastCloudPushAt) scheduleCloudPush();
    return;
  }
  const remote = snap.data();
  if(remote.updatedBy === getDeviceId()) return;
  const remoteTs = Number(remote.updatedAt || 0);
  const meta = getSyncMeta();
  const localTs = Number(meta.localUpdatedAt || 0);
  if(remoteTs > localTs){
    const data = await decryptPayload(remote.payload, state.cloud.settings.passphrase);
    applyCloudData(data, remoteTs);
    updateCloudStatus("تم تنزيل أحدث بيانات من السحابة.");
  } else if(meta.hasPending){
    scheduleCloudPush();
  }
}
function applyCloudData(data, remoteTs){
  if(!data) return;
  state.suppressSync = true;
  state.formulas = data.formulas || {};
  state.raw = migrateRaw(data.rawMaterials || {});
  localStorage.setItem(LS.formulas, JSON.stringify(state.formulas));
  localStorage.setItem(LS.raw, JSON.stringify(state.raw));
  if(Array.isArray(data.priceLog)) localStorage.setItem(LS.log, JSON.stringify(data.priceLog.slice(-1000)));
  state.suppressSync = false;
  populateFormulaSelects();
  const current = document.getElementById("formulaSelect")?.value;
  const next = current && state.formulas[current] ? current : Object.keys(state.formulas)[0];
  if(next) loadFormula(next); else newFormula();
  const meta = getSyncMeta();
  meta.localUpdatedAt = remoteTs || Date.now();
  meta.lastCloudPullAt = Date.now();
  meta.hasPending = false;
  saveSyncMeta(meta);
}
async function cloudPush(force=false){
  const settings = state.cloud.settings || loadCloudSettings();
  if(!settings.firebaseConfig || !settings.syncId) return;
  if(!navigator.onLine){ updateCloudStatus(); return; }
  if(!state.cloud.enabled || !state.cloud.docRef) await connectCloudSync(false);
  if(!state.cloud.enabled || !state.cloud.docRef) return;
  const meta = getSyncMeta();
  if(!force && !meta.hasPending) return;
  try{
    updateCloudStatus("جاري رفع البيانات للسحابة...");
    const updatedAt = meta.localUpdatedAt || Date.now();
    const payload = await encryptPayload(snapshotData(), settings.passphrase);
    await state.cloud.fs.setDoc(state.cloud.docRef, {
      payload,
      updatedAt,
      updatedAtIso: new Date(updatedAt).toISOString(),
      updatedBy: getDeviceId(),
      appVersion: "v8-cloud-sync"
    }, {merge:true});
    meta.lastCloudPushAt = Date.now();
    meta.hasPending = false;
    saveSyncMeta(meta);
    updateCloudStatus("تم رفع البيانات للسحابة.");
  }catch(err){
    updateCloudStatus("فشل رفع البيانات: " + err.message);
  }
}
async function cloudPull(forceAlert=false){
  const settings = state.cloud.settings || loadCloudSettings();
  if(!settings.firebaseConfig || !settings.syncId){ alert("برجاء ضبط إعدادات Firebase أولًا."); return; }
  if(!navigator.onLine){ alert("لا يوجد إنترنت حاليًا."); return; }
  if(!state.cloud.enabled || !state.cloud.docRef) await connectCloudSync(false);
  try{
    const snap = await state.cloud.fs.getDoc(state.cloud.docRef);
    if(!snap.exists()){ if(forceAlert) alert("لا توجد بيانات محفوظة على السحابة حتى الآن."); return; }
    const remote = snap.data();
    const data = await decryptPayload(remote.payload, settings.passphrase);
    applyCloudData(data, Number(remote.updatedAt || Date.now()));
    if(forceAlert) alert("تم تنزيل البيانات من السحابة.");
  }catch(err){ alert("فشل تنزيل البيانات: " + err.message); }
}
function bindCloudUI(){
  fillCloudUI();
  document.getElementById("btnCloudSave")?.addEventListener("click", ()=>{
    const settings = readCloudUISettings();
    saveCloudSettings(settings);
    state.cloud.settings = settings;
    updateCloudStatus("تم حفظ إعدادات المزامنة. اضغط اتصال / تفعيل.");
  });
  document.getElementById("btnCloudConnect")?.addEventListener("click", async ()=>{
    const settings = readCloudUISettings(); saveCloudSettings(settings); state.cloud.settings = settings;
    await connectCloudSync(true);
  });
  document.getElementById("btnCloudPush")?.addEventListener("click", async ()=>{
    const settings = readCloudUISettings(); saveCloudSettings(settings); state.cloud.settings = settings;
    const meta = getSyncMeta(); meta.hasPending = true; meta.localUpdatedAt = Date.now(); saveSyncMeta(meta);
    await cloudPush(true);
  });
  document.getElementById("btnCloudPull")?.addEventListener("click", ()=>cloudPull(true));
  window.addEventListener("online", ()=>connectCloudSync(false));
  window.addEventListener("visibilitychange", ()=>{ if(!document.hidden) connectCloudSync(false); });
  connectCloudSync(false);
}

function bind(){
  document.getElementById("formulaSelect").addEventListener("change", e=>loadFormula(e.target.value));
  ["batchKg","wastePct","mfgCost","packingCost","transportCost","financeCost","marginPct","viewMode","mixName"].forEach(id=>document.getElementById(id).addEventListener("input", calculate));
  document.getElementById("btnAddIngredient").addEventListener("click", ()=>{state.currentIngredients.push({category:"",name:"",phr:0,price:0}); renderIngredients();});
  document.getElementById("btnSave").addEventListener("click", saveCurrent);
  document.getElementById("btnNew").addEventListener("click", newFormula);
  document.getElementById("btnDuplicate").addEventListener("click", ()=>{document.getElementById("mixName").value=(getInputs().mixName||"Formula")+" - Copy"; calculate();});
  document.getElementById("btnDelete").addEventListener("click", ()=>{const n=document.getElementById("formulaSelect").value; if(n && confirm("حذف الخلطة؟")){delete state.formulas[n]; saveFormulas(); const first=Object.keys(state.formulas)[0]; first?loadFormula(first):newFormula();}});
  document.getElementById("excelImport").addEventListener("change", e=>{ if(e.target.files[0]) importExcel(e.target.files[0]); e.target.value="";});
  document.getElementById("formulaExcelImport").addEventListener("change", e=>{ if(e.target.files[0]) importFormulaExcel(e.target.files[0]); e.target.value="";});
  document.getElementById("btnExportFormulaExcel").addEventListener("click", exportFormulaExcel);
  document.getElementById("jsonImport").addEventListener("change", async e=>{
    const f=e.target.files[0]; if(!f) return;
    const txt=await f.text(); const obj=JSON.parse(txt);
    state.formulas=obj.formulas||obj; if(obj.rawMaterials) state.raw=migrateRaw(obj.rawMaterials);
    saveFormulas(); saveRaw(); seed();
  });
  document.getElementById("btnExportBackup").addEventListener("click", ()=>{
    downloadBlob("pvc-calculator-backup.json", new Blob([JSON.stringify({formulas:state.formulas,rawMaterials:state.raw},null,2)], {type:"application/json"}));
  });
  document.getElementById("btnExportRaw").addEventListener("click", ()=>{
    exportCsv("raw-material-prices.csv", [["Material Name","Category","Price EGP/Kg","Last Updated","Source"], ...Object.values(state.raw).map(r=>[r.name,r.category||"",r.price,r.updatedAt,r.source])]);
  });
  document.getElementById("btnExportCostCsv").addEventListener("click", ()=>{
    const inp=getInputs(); const totalPhr=state.currentIngredients.reduce((s,i)=>s+num(i.phr),0);
    exportCsv(`cost-${inp.mixName||"formula"}.csv`, [["Category","Material","PHR","Kg/Batch","Price/Kg","Cost"], ...state.currentIngredients.map(i=>{const kg=totalPhr?num(i.phr)/totalPhr*inp.batchKg:0; return [i.category||"",i.name,i.phr,kg,i.price,kg*num(i.price)]})]);
  });
  document.getElementById("btnPrint").addEventListener("click", ()=>window.print());
  document.getElementById("btnPrintCustomer")?.addEventListener("click", printCustomerQuote);
  document.getElementById("btnCopyCustomer")?.addEventListener("click", copyCustomerQuote);
  document.getElementById("btnCompare").addEventListener("click", compare);
  document.getElementById("btnShowLog").addEventListener("click", ()=>{renderLog(); document.getElementById("logDialog").showModal();});
  document.getElementById("btnLock").addEventListener("click", ()=>document.getElementById("lockDialog").showModal());
  document.getElementById("btnSetPassword").addEventListener("click", e=>{
    e.preventDefault(); const p=document.getElementById("passwordInput").value; if(p){localStorage.setItem(LS.password,btoa(p)); alert("تم حفظ كلمة المرور محليًا."); document.getElementById("lockDialog").close();}
  });
}

function renderLog(){
  const log=getLog().slice().reverse();
  document.getElementById("priceLog").innerHTML = log.length ? `<table><thead><tr><th>التاريخ</th><th>التصنيف</th><th>الخامة</th><th>قديم</th><th>جديد</th><th>المصدر</th></tr></thead><tbody>`+
    log.map(x=>`<tr><td>${new Date(x.date).toLocaleString("ar-EG")}</td><td>${escapeHtml(x.category||"-")}</td><td>${escapeHtml(x.material)}</td><td>${fmt(x.oldPrice)}</td><td>${fmt(x.newPrice)}</td><td>${escapeHtml(x.source)}</td></tr>`).join("")+`</tbody></table>` : "<p class='muted'>لا يوجد سجل حتى الآن.</p>";
}

window.addEventListener("afterprint", ()=>document.body.classList.remove("print-customer"));
bind(); seed(); bindCloudUI();
