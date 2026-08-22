import{r as b,R as c,a as o}from"./index-mxYnnJSI.js";import{u as M,b as q,a as A,n as F,_ as K,q as W,c as $,p as G,L as H}from"./useResizeObserver-TNRxJNdE.js";/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */var I={block:!1,disabled:!1,ghost:!1,loading:!1,shape:"rectangle",size:"medium",type:"button",variant:"base"};/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */var J=["type","theme","variant","icon","disabled","loading","size","block","ghost","shape","children","content","className","suffix","href","tag","onClick"];function P(r,t){var e=Object.keys(r);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(r);t&&(n=n.filter(function(i){return Object.getOwnPropertyDescriptor(r,i).enumerable})),e.push.apply(e,n)}return e}function j(r){for(var t=1;t<arguments.length;t++){var e=arguments[t]!=null?arguments[t]:{};t%2?P(Object(e),!0).forEach(function(n){o(r,n,e[n])}):Object.getOwnPropertyDescriptors?Object.defineProperties(r,Object.getOwnPropertyDescriptors(e)):P(Object(e)).forEach(function(n){Object.defineProperty(r,n,Object.getOwnPropertyDescriptor(e,n))})}return r}var _=b.forwardRef(function(r,t){var e=M(r,I),n=e.type,i=e.theme,f=e.variant,k=e.icon,s=e.disabled,l=e.loading,m=e.size,C=e.block,x=e.ghost,g=e.shape,D=e.children,p=e.content,N=e.className,h=e.suffix,d=e.href,u=e.tag,w=e.onClick,E=q(e,J),R=A(),a=R.classPrefix,z=F(),v=K(z,2),B=v[0],T=v[1];W((t==null?void 0:t.current)||B);var y=p??D,O=k;l&&(O=c.createElement(H,{loading:l,inheritColor:!0}));var S=b.useMemo(function(){return i||(f==="base"?"primary":"default")},[i,f]),L=b.useMemo(function(){return!u&&d&&!s?"a":!u&&s?"div":u||"button"},[u,d,s]);return c.createElement(L,j(j({},E),{},{href:d,type:n,ref:t||T,disabled:s||l,className:$(N,["".concat(a,"-button"),"".concat(a,"-button--theme-").concat(S),"".concat(a,"-button--variant-").concat(f)],o(o(o(o(o(o(o({},"".concat(a,"-button--shape-").concat(g),g!=="rectangle"),"".concat(a,"-button--ghost"),x),"".concat(a,"-is-loading"),l),"".concat(a,"-is-disabled"),s),"".concat(a,"-size-s"),m==="small"),"".concat(a,"-size-l"),m==="large"),"".concat(a,"-size-full-width"),C)),onClick:!s&&!l?w:void 0}),c.createElement(c.Fragment,null,O,y&&c.createElement("span",{className:"".concat(a,"-button__text")},y),h&&c.createElement("span",{className:"".concat(a,"-button__suffix")},G(h))))});_.displayName="Button";/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */var V=_;export{V as B};
