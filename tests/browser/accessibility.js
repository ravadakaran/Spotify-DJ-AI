// Rendered text contrast audit, for the app's opaque dark surfaces.
// This complements keyboard journeys; it is not a WCAG certification.
export async function audit(page, view) {
  return page.evaluate(view => {
    const rgb = text => (text.match(/[\d.]+/g) || []).map(Number);
    const blend = (top, below) => {
      const alpha = top[3] ?? 1;
      return top.slice(0,3).map((v,i)=>v*alpha+below[i]*(1-alpha));
    };
    const luminance = c => c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const failures=[], controls=[];
    for (const el of document.querySelectorAll('body *')) {
      if (!el.checkVisibility() || el.closest('[disabled]')) continue;
      if (el.matches('button,input,select,textarea,summary,a[href]')) controls.push({tag:el.tagName,name:el.getAttribute('aria-label') || el.labels?.[0]?.textContent?.trim() || el.textContent?.trim() || el.getAttribute('title') || '',focusable:el.tabIndex>=0});
      const text=Array.from(el.childNodes).filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').trim();
      if(!text || el.matches('script,style,option'))continue;
      const style=getComputedStyle(el), chain=[];
      for(let parent=el;parent;parent=parent.parentElement)chain.unshift(parent);
      let background=[255,255,255];
      for(const parent of chain)background=blend(rgb(getComputedStyle(parent).backgroundColor),background);
      const foreground=blend(rgb(style.color),background), a=luminance(foreground), b=luminance(background), ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      const large=parseFloat(style.fontSize)>=24 || (parseFloat(style.fontSize)>=18.66 && Number(style.fontWeight)>=700), required=large?3:4.5;
      if(ratio<required)failures.push({text:text.slice(0,60),className:el.className,ratio,required,foreground:style.color,background});
    }
    return {view,failures,controls,limitations:'Computed solid colors; gradients, icons, opacity groups, focus visibility and screen-reader announcements need manual review'};
  },view);
}
