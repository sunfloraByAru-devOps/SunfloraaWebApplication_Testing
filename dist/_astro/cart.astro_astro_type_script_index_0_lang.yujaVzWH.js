import{g as l,b as i,u as d,r as u}from"./cart.C3ECpWB2.js";function o(a){return"₹"+(Number(a)||0).toFixed(2)}function c(){const a=l(),n=document.getElementById("cart-items"),r=document.getElementById("cart-empty"),s=document.getElementById("cart-summary");if(a.length===0){n.innerHTML="",r.classList.remove("hidden"),s.classList.add("hidden");return}r.classList.add("hidden"),s.classList.remove("hidden"),n.innerHTML=a.map((t,e)=>`
        <div class="flex gap-4 items-center border border-[#E8D5C4] rounded-lg p-4">
          <img src="${t.image_url||""}" alt="${t.name}" class="w-20 h-20 object-cover rounded-md bg-[#FFF8F0]" />
          <div class="flex-1">
            <p class="font-medium text-[#5C3D2E]">${t.name}</p>
            <p class="text-xs text-[#9a8b7a]">${t.size_label||""}${t.size_label&&t.color_name?" · ":""}${t.color_name||""}</p>
            <p class="text-sm text-[#5C3D2E] mt-1">${o(t.unit_price)}</p>
          </div>
          <div class="flex items-center gap-2">
            <button data-idx="${e}" class="qty-minus w-8 h-8 border border-[#E8D5C4] rounded">−</button>
            <span class="w-6 text-center">${t.quantity}</span>
            <button data-idx="${e}" class="qty-plus w-8 h-8 border border-[#E8D5C4] rounded">+</button>
          </div>
          <button data-idx="${e}" class="remove-btn text-[#D4708F] text-sm ml-2">Remove</button>
        </div>
      `).join(""),document.getElementById("cart-subtotal").textContent=o(i()),n.querySelectorAll(".qty-minus").forEach(t=>t.addEventListener("click",()=>{const e=a[Number(t.dataset.idx)];d(e,e.quantity-1)})),n.querySelectorAll(".qty-plus").forEach(t=>t.addEventListener("click",()=>{const e=a[Number(t.dataset.idx)];d(e,e.quantity+1)})),n.querySelectorAll(".remove-btn").forEach(t=>t.addEventListener("click",()=>{u(a[Number(t.dataset.idx)])}))}c();window.addEventListener("cart:updated",c);
