// SmartBill – main JS
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const itemsBody   = $("#itemsBody");
const subtotalEl  = $("#subtotal");
const taxEl       = $("#totalTax");
const discountEl  = $("#totalDiscount");
const grandEl     = $("#grandTotal");
const msgEl       = $("#msg");

// Receipt preview fields
const rNoEl       = $("#rNo");
const rDateEl     = $("#rDate");
const rCustEl     = $("#rCustomer");
const rPhoneEl    = $("#rPhone");
const rItemsEl    = $("#rItems");
const rSubEl      = $("#rSubtotal");
const rTaxEl      = $("#rTax");
const rDiscEl     = $("#rDiscount");
const rGrandEl    = $("#rGrand");

const stateKey = "smartbill_draft_v1";

function money(n){
  return "₹" + (Number(n||0)).toFixed(2);
}

function todayISO(){
  const d = new Date();
  return d.toISOString().slice(0,10);
}

function addRow(item = {name:"", qty:1, price:0, tax:0, disc:0}) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input class="text-input item-name" placeholder="Item name" value="${item.name}"></td>
    <td><input class="num-input item-qty"   type="number" min="1" step="1" value="${item.qty}"></td>
    <td><input class="num-input item-price" type="number" min="0" step="0.01" value="${item.price}"></td>
    <td><input class="num-input item-tax"   type="number" min="0" step="0.01" value="${item.tax}"></td>
    <td><input class="num-input item-disc"  type="number" min="0" step="0.01" value="${item.disc}"></td>
    <td class="amount-cell">₹0.00</td>
    <td><button class="remove-btn" title="Remove">×</button></td>
  `;
  itemsBody.appendChild(tr);
  tr.addEventListener("input", recalc);
  tr.querySelector(".remove-btn").addEventListener("click", ()=>{
    tr.remove();
    recalc();
    saveDraft();
  });
  recalc();
  saveDraft();
}

function getItems(){
  const rows = [...itemsBody.querySelectorAll("tr")];
  return rows.map(r => {
    const name = r.querySelector(".item-name").value.trim();
    const qty  = Number(r.querySelector(".item-qty").value);
    const price= Number(r.querySelector(".item-price").value);
    const tax  = Number(r.querySelector(".item-tax").value);
    const disc = Number(r.querySelector(".item-disc").value);
    return {name, qty, price, tax, disc, row:r};
  });
}

function recalc(){
  const items = getItems();

  let subtotal = 0, totalTax = 0, totalDisc = 0;

  items.forEach(it=>{
    const base = it.qty * it.price;
    const taxAmt  = base * (it.tax/100);
    const discAmt = base * (it.disc/100);
    const lineAmt = base + taxAmt - discAmt;

    subtotal += base;
    totalTax += taxAmt;
    totalDisc += discAmt;

    const cell = it.row.querySelector(".amount-cell");
    cell.textContent = money(lineAmt);
  });

  const grand = subtotal + totalTax - totalDisc;

  subtotalEl.textContent = money(subtotal);
  taxEl.textContent      = money(totalTax);
  discountEl.textContent = "− " + money(totalDisc).slice(1);
  grandEl.textContent    = money(grand);
}

function validateForm(){
  const name = $("#customerName").value.trim();
  const phone = $("#customerPhone").value.trim();
  if(!name){ showMsg("Please enter customer name."); return false; }
  if(!phone){ showMsg("Please enter contact number."); return false; }
  if(!/^\d{7,15}$/.test(phone)){ showMsg("Enter a valid phone number (digits only)."); return false; }
  const items = getItems();
  if(items.length === 0){ showMsg("Add at least one item."); return false; }
  for(const it of items){
    if(!it.name){ showMsg("Each item must have a name."); return false; }
    if(!(it.qty>0) || !(it.price>=0)){ showMsg("Check quantity and price values."); return false; }
    if(it.tax<0 || it.disc<0){ showMsg("Tax/Discount cannot be negative."); return false; }
  }
  showMsg(""); // clear
  return true;
}

function showMsg(text){
  msgEl.textContent = text || "";
}

function generateReceipt(){
  if(!validateForm()) return;

  // fill meta
  const rNo  = $("#receiptNo").value.trim() || "(auto)";
  const rDat = $("#receiptDate").value || todayISO();
  rNoEl.textContent   = rNo;
  rDateEl.textContent = rDat;

  rCustEl.textContent  = $("#customerName").value.trim();
  rPhoneEl.textContent = $("#customerPhone").value.trim();

  // fill items
  rItemsEl.innerHTML = "";
  const items = getItems();
  items.forEach(it=>{
    const base = it.qty * it.price;
    const line = base + (base*it.tax/100) - (base*it.disc/100);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(it.name)}</td>
      <td>${it.qty}</td>
      <td>${money(it.price)}</td>
      <td>${(it.tax||0).toFixed(2)}</td>
      <td>${(it.disc||0).toFixed(2)}</td>
      <td>${money(line)}</td>
    `;
    rItemsEl.appendChild(tr);
  });

  // totals
  rSubEl.textContent = subtotalEl.textContent;
  rTaxEl.textContent = taxEl.textContent;
  rDiscEl.textContent= discountEl.textContent;
  rGrandEl.textContent= grandEl.textContent;

  showMsg("Receipt generated. You can download PDF or print.");
}

function escapeHtml(s){
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

async function downloadPDF(){
  // Ensure we have a generated receipt to capture
  generateReceipt();

  const receipt = document.getElementById("receipt");
  const { jsPDF } = window.jspdf || {};
  if(!jsPDF || !window.html2canvas){
    showMsg("PDF libraries not loaded. Try Print instead.");
    return;
  }

  // scale up for sharpness
  const canvas = await html2canvas(receipt, {scale: 2, backgroundColor: "#ffffff"});
  const imgData = canvas.toDataURL("image/png");

  // A4 portrait (mm)
  const pdf = new jsPDF("p","mm","a4");
  const pageWidth  = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // fit image width-wise and keep aspect ratio
  const imgProps = pdf.getImageProperties(imgData);
  const ratio = imgProps.height / imgProps.width;
  const pdfWidth = pageWidth - 20; // margins
  const pdfHeight = pdfWidth * ratio;

  pdf.addImage(imgData, "PNG", 10, 10, pdfWidth, pdfHeight);
  pdf.save(`${($("#receiptNo").value.trim() || "SmartBill")}.pdf`);
  showMsg("PDF downloaded.");
}

function printReceipt(){
  generateReceipt();
  window.print();
}

function resetAll(){
  $("#customerName").value = "";
  $("#customerPhone").value = "";
  $("#receiptNo").value = "";
  $("#receiptDate").value = todayISO();
  itemsBody.innerHTML = "";
  addRow();
  recalc();
  showMsg("Cleared.");
  saveDraft();
}

function clearItems(){
  itemsBody.innerHTML = "";
  recalc();
  saveDraft();
}

function saveDraft(){
  const draft = {
    customerName: $("#customerName").value,
    customerPhone: $("#customerPhone").value,
    receiptNo: $("#receiptNo").value,
    receiptDate: $("#receiptDate").value,
    items: getItems().map(({name,qty,price,tax,disc})=>({name,qty,price,tax,disc}))
  };
  localStorage.setItem(stateKey, JSON.stringify(draft));
}

function loadDraft(){
  const str = localStorage.getItem(stateKey);
  if(!str){ addRow(); $("#receiptDate").value = todayISO(); return; }
  try{
    const d = JSON.parse(str);
    $("#customerName").value = d.customerName || "";
    $("#customerPhone").value = d.customerPhone || "";
    $("#receiptNo").value = d.receiptNo || "";
    $("#receiptDate").value = d.receiptDate || todayISO();
    itemsBody.innerHTML = "";
    (d.items && d.items.length ? d.items : [{}]).forEach(addRow);
    recalc();
  }catch(e){
    addRow();
    $("#receiptDate").value = todayISO();
  }
}

function init(){
  $("#year").textContent = new Date().getFullYear();
  $("#addRowBtn").addEventListener("click", ()=>{ addRow(); });
  $("#generateBtn").addEventListener("click", generateReceipt);
  $("#downloadBtn").addEventListener("click", downloadPDF);
  $("#printBtn").addEventListener("click", printReceipt);
  $("#resetBtn").addEventListener("click", resetAll);
  $("#clearAllBtn").addEventListener("click", clearItems);

  // Recalculate & save on any top-field input
  ["#customerName","#customerPhone","#receiptNo","#receiptDate"].forEach(sel=>{
    $(sel).addEventListener("input", saveDraft);
    $(sel).addEventListener("change", saveDraft);
  });

  loadDraft();
}

document.addEventListener("DOMContentLoaded", init);
