import{s as l}from"./supabase.G8weG8ih.js";import{d as u}from"./cart.C3ECpWB2.js";const o=new URLSearchParams(window.location.search),m=o.get("status"),r=o.get("order"),a=o.get("email"),c=document.getElementById("banner"),d={success:{icon:"🎉",title:"Payment successful!",sub:"Thank you — your order is confirmed. A confirmation email is on its way."},pending:{icon:"⏳",title:"Payment pending",sub:"We're waiting for payment confirmation. Your cart has not been cleared — you can retry from the tracking page if needed."},failed:{icon:"⚠️",title:"Payment didn't go through",sub:"No amount was charged. You can retry payment from the tracking page below."},not_found:{icon:"❓",title:"We couldn't find that order",sub:"Please check your order tracking page directly."},invalid:{icon:"❓",title:"Something went wrong",sub:"Please check your order status on the tracking page."}};let f=m||"invalid";function n(e){const t=d[e]||d.invalid;c&&(c.innerHTML=`
          <div class="text-5xl mb-3">${t.icon}</div>
          <h1 class="font-serif-display text-3xl text-[#5C3D2E] mb-2">${t.title}</h1>
          <p class="text-[#9a8b7a]">${t.sub}</p>
          ${r?`<p class="mt-3 text-sm text-[#5C3D2E]">Order number: <strong>${r}</strong></p>`:""}
        `)}n(f);async function p(){if(!(!r||!a))try{const{data:e,error:t}=await l.functions.invoke("track-order",{body:{order_number:r,email:a}});if(t||e?.error){n("not_found");return}const s=e.payment_status,g=e.status;s==="paid"?(u(),n("success")):n(s==="failed"?"failed":"pending");const i=document.getElementById("details");i&&(i.innerHTML=`
            <div class="border border-[#E8D5C4] rounded-xl p-6 bg-[#FFF8F0]">
              <p class="font-medium text-[#5C3D2E]">${e.stage_label}</p>
              <p class="text-sm text-[#9a8b7a] mb-3">${e.stage_description}</p>
              <a href="/track-order?order=${encodeURIComponent(r)}&email=${encodeURIComponent(a)}" class="text-sm text-[#D4708F] underline">View full order tracking →</a>
            </div>
          `)}catch(e){console.error("[Sunflora] Could not verify order:",e)}}p();
