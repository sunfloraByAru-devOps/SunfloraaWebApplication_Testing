import{s as n}from"./supabase.G8weG8ih.js";function i(t){return"₹"+(Number(t)||0).toFixed(2)}try{const{data:t}=await n.auth.getSession();if(t.session){const{data:e,error:r}=await n.from("orders").select("id, order_number, status, payment_status, total, created_at").order("created_at",{ascending:!1});r&&console.error("[Sunflora] Could not load orders:",r);const a=document.getElementById("orders-list");if(a)if(!e||e.length===0){const o=document.getElementById("orders-empty");o&&o.classList.remove("hidden")}else{const o=t.session.user.email;a.innerHTML=e.map(s=>`
          <a href="/track-order?order=${encodeURIComponent(s.order_number)}&email=${encodeURIComponent(o||"")}"
             class="flex justify-between items-center border border-[#E8D5C4] rounded-lg p-4 hover:bg-[#FFF8F0]">
            <div>
              <p class="font-medium text-[#5C3D2E]">${s.order_number}</p>
              <p class="text-xs text-[#9a8b7a]">${new Date(s.created_at).toLocaleDateString()} · ${s.status} · payment: ${s.payment_status}</p>
            </div>
            <span class="text-[#5C3D2E] font-medium">${i(s.total)}</span>
          </a>`).join("")}}else{const e=document.getElementById("signed-out");e&&e.classList.remove("hidden")}}catch(t){console.error("[Sunflora] Failed to check session / load orders:",t);const e=document.getElementById("signed-out");e&&e.classList.remove("hidden")}const d=document.getElementById("logout-btn");d&&d.addEventListener("click",async()=>{await n.auth.signOut(),window.location.href="/"});
