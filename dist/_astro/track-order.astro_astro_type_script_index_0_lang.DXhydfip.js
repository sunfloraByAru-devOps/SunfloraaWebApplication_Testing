import{s as c}from"./supabase.pi5ZXsf7.js";const r=new URLSearchParams(window.location.search);r.get("order")&&(document.getElementById("order-number-input").value=r.get("order"));r.get("email")&&(document.getElementById("email-input").value=r.get("email"));function m(e){return"₹"+(Number(e)||0).toFixed(2)}function b(e){const o=document.getElementById("track-result");o.classList.remove("hidden");const n=Math.max(0,Math.min(100,e.progress_step/e.total_steps*100)),a=(e.history||[]).map(t=>`
        <li class="text-sm text-[#5C3D2E]">
          <strong>${t.label}</strong> — ${new Date(t.at).toLocaleString()}
          ${t.note?`<br/><span class="text-[#9a8b7a]">${t.note}</span>`:""}
        </li>`).join(""),s=e.type==="order"&&e.payment_status==="failed"?'<button id="retry-payment-btn" class="bg-[#D4708F] text-white px-5 py-2 rounded-lg text-sm mt-2">Retry Payment</button>':"";o.innerHTML=`
        <div class="border border-[#E8D5C4] rounded-xl p-6 bg-[#FFF8F0]">
          <div class="flex justify-between items-start mb-2">
            <div>
              <p class="text-xs text-[#9a8b7a] uppercase tracking-wide">${e.type==="custom_order"?"Custom Order":"Order"}</p>
              <p class="font-serif-display text-xl text-[#5C3D2E]">${e.order_number}</p>
            </div>
            ${e.total?`<p class="text-[#5C3D2E] font-medium">${m(e.total)}</p>`:""}
          </div>

          <div class="w-full bg-[#E8D5C4] rounded-full h-2 my-4">
            <div class="bg-[#D4708F] h-2 rounded-full" style="width:${n}%"></div>
          </div>

          <p class="font-medium text-[#5C3D2E]">${e.stage_label}</p>
          <p class="text-sm text-[#9a8b7a] mb-3">${e.stage_description}</p>

          ${e.tracking_number?`<p class="text-sm text-[#5C3D2E]">Courier: ${e.courier||"—"} · Tracking ID: <strong>${e.tracking_number}</strong></p>`:""}
          ${e.tracking_url?`<a href="${e.tracking_url}" target="_blank" class="text-sm text-[#D4708F] underline">Track shipment →</a>`:""}
          ${e.quoted_price?`<p class="text-sm text-[#5C3D2E] mt-2">Quoted price: <strong>${m(e.quoted_price)}</strong></p>`:""}
          ${s}
        </div>

        ${e.items?`<div class="flex flex-col gap-2">
          <p class="text-sm font-medium text-[#5C3D2E]">Items</p>
          ${e.items.map(t=>`
            <div class="flex justify-between text-sm text-[#5C3D2E]">
              <span>${t.product_name}${t.size_label?" ("+t.size_label+")":""} × ${t.quantity}</span>
              <span>${m(t.unit_price*t.quantity)}</span>
            </div>`).join("")}
        </div>`:""}

        ${a?`<div><p class="text-sm font-medium text-[#5C3D2E] mb-2">History</p><ul class="flex flex-col gap-2">${a}</ul></div>`:""}
      `,document.getElementById("retry-payment-btn")?.addEventListener("click",async t=>{t.target.disabled=!0,t.target.textContent="Redirecting...";const{data:l,error:p}=await c.functions.invoke("paytm-initiate",{body:{order_id:e.order_id}});if(p||l?.error){alert(l?.error||"Could not start payment. Please try again."),t.target.disabled=!1,t.target.textContent="Retry Payment";return}const i=document.createElement("form");i.method="POST",i.action=l.action_url,Object.entries(l.params).forEach(([g,y])=>{const d=document.createElement("input");d.type="hidden",d.name=g,d.value=String(y),i.appendChild(d)}),document.body.appendChild(i),i.submit()})}async function u(e,o){const n=document.getElementById("track-error"),a=document.getElementById("track-result");n.classList.add("hidden"),a.classList.add("hidden");const{data:s,error:t}=await c.functions.invoke("track-order",{body:{order_number:e,email:o}});if(t||s?.error){n.textContent=s?.error||"We couldn't find that order.",n.classList.remove("hidden");return}b(s)}document.getElementById("track-form").addEventListener("submit",e=>{e.preventDefault(),u(document.getElementById("order-number-input").value.trim(),document.getElementById("email-input").value.trim())});r.get("order")&&r.get("email")&&u(r.get("order"),r.get("email"));
