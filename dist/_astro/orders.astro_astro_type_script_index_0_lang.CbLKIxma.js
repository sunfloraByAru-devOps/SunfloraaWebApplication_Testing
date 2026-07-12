import{s}from"./supabase.pi5ZXsf7.js";function r(t){return"₹"+(Number(t)||0).toFixed(2)}const{data:a}=await s.auth.getSession();if(!a.session)document.getElementById("signed-out").classList.remove("hidden");else{const{data:t}=await s.from("orders").select("id, order_number, status, payment_status, total, created_at").order("created_at",{ascending:!1}),n=document.getElementById("orders-list");if(!t||t.length===0)document.getElementById("orders-empty").classList.remove("hidden");else{const o=a.session.user.email;n.innerHTML=t.map(e=>`
          <a href="/track-order?order=${encodeURIComponent(e.order_number)}&email=${encodeURIComponent(o||"")}"
             class="flex justify-between items-center border border-[#E8D5C4] rounded-lg p-4 hover:bg-[#FFF8F0]">
            <div>
              <p class="font-medium text-[#5C3D2E]">${e.order_number}</p>
              <p class="text-xs text-[#9a8b7a]">${new Date(e.created_at).toLocaleDateString()} · ${e.status} · payment: ${e.payment_status}</p>
            </div>
            <span class="text-[#5C3D2E] font-medium">${r(e.total)}</span>
          </a>`).join("")}}document.getElementById("logout-btn").addEventListener("click",async()=>{await s.auth.signOut(),window.location.href="/"});
