const h="modulepreload",u=function(o,r){return new URL(o,r).href},a={},d=function(o,r,i){if(!r||r.length===0)return o();const c=document.getElementsByTagName("link");return Promise.all(r.map(e=>{if(e=u(e,i),e in a)return;a[e]=!0;const t=e.endsWith(".css"),f=t?'[rel="stylesheet"]':"";if(i)for(let s=c.length-1;s>=0;s--){const l=c[s];if(l.href===e&&(!t||l.rel==="stylesheet"))return}else if(document.querySelector(`link[href="${e}"]${f}`))return;const n=document.createElement("link");if(n.rel=t?"stylesheet":h,!t&&(n.as="script",n.crossOrigin=""),n.href=e,document.head.appendChild(n),t)return new Promise((s,l)=>{n.addEventListener("load",s),n.addEventListener("error",()=>l(new Error(`Unable to preload CSS for ${e}`)))})})).then(()=>o()).catch(e=>{const t=new Event("vite:preloadError",{cancelable:!0});if(t.payload=e,window.dispatchEvent(t),!t.defaultPrevented)throw e})};export{d as _};