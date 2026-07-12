import{s as c}from"./supabase.pi5ZXsf7.js";const o=new URLSearchParams(window.location.search),d=o.get("status"),e=o.get("order"),n=o.get("email"),l=document.getElementById("banner"),a={success:{icon:"🎉",title:"Payment successful!",sub:"Thank you — your order is confirmed. A confirmation email is on its way."},failed:{icon:"⚠️",title:"Payment didn't go through",sub:"No amount was charged. You can retry payment from the tracking page below."},not_found:{icon:"❓",title:"We couldn't find that order",sub:"Please check your order tracking page directly."},invalid:{icon:"❓",title:"Something went wrong",sub:"Please check your order status on the tracking page."}},r=a[d]||a.invalid;l.innerHTML=`
      <div class="text-5xl mb-3">${r.icon}</div>
      <h1 class="font-serif-display text-3xl text-[#5C3D2E] mb-2">${r.title}</h1>
      <p class="text-[#9a8b7a]">${r.sub}</p>
      ${e?`<p class="mt-3 text-sm text-[#5C3D2E]">Order number: <strong>${e}</strong></p>`:""}
    `;async function m(){if(!e||!n)return;const{data:t,error:s}=await c.functions.invoke("track-order",{body:{order_number:e,email:n}});if(s||t?.error)return;const i=document.getElementById("details");i.innerHTML=`
        <div class="border border-[#E8D5C4] rounded-xl p-6 bg-[#FFF8F0]">
          <p class="font-medium text-[#5C3D2E]">${t.stage_label}</p>
          <p class="text-sm text-[#9a8b7a] mb-3">${t.stage_description}</p>
          <a href="/track-order?order=${encodeURIComponent(e)}&email=${encodeURIComponent(n)}" class="text-sm text-[#D4708F] underline">View full order tracking →</a>
        </div>
      `}m();
