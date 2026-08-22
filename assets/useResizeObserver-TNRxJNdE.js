import{K as Ue,r as p,U as Xe,V as qe,L as mt,H as Ye,l as yt,G as gt,a as _,R as d,W as he,i as Je}from"./index-mxYnnJSI.js";/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */function Se(e,t){(t==null||t>e.length)&&(t=e.length);for(var r=0,n=new Array(t);r<t;r++)n[r]=e[r];return n}function Qe(e,t){if(e){if(typeof e=="string")return Se(e,t);var r=Object.prototype.toString.call(e).slice(8,-1);if(r==="Object"&&e.constructor&&(r=e.constructor.name),r==="Map"||r==="Set")return Array.from(e);if(r==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(r))return Se(e,t)}}/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */function bt(e){if(Array.isArray(e))return e}function ht(e,t){var r=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(r!=null){var n=[],o=!0,a=!1,i,c;try{for(r=r.call(e);!(o=(i=r.next()).done)&&(n.push(i.value),!(t&&n.length===t));o=!0);}catch(s){a=!0,c=s}finally{try{!o&&r.return!=null&&r.return()}finally{if(a)throw c}}return n}}function wt(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function Ee(e,t){return bt(e)||ht(e,t)||Qe(e,t)||wt()}/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */function Ot(e,t){if(e==null)return{};var r={},n=Object.keys(e),o,a;for(a=0;a<n.length;a++)o=n[a],!(t.indexOf(o)>=0)&&(r[o]=e[o]);return r}function vr(e,t){if(e==null)return{};var r=Ot(e,t),n,o;if(Object.getOwnPropertySymbols){var a=Object.getOwnPropertySymbols(e);for(o=0;o<a.length;o++)n=a[o],!(t.indexOf(n)>=0)&&Object.prototype.propertyIsEnumerable.call(e,n)&&(r[n]=e[n])}return r}var Ze={exports:{}};/*!
	Copyright (c) 2018 Jed Watson.
	Licensed under the MIT License (MIT), see
	http://jedwatson.github.io/classnames
*/(function(e){(function(){var t={}.hasOwnProperty;function r(){for(var n=[],o=0;o<arguments.length;o++){var a=arguments[o];if(a){var i=typeof a;if(i==="string"||i==="number")n.push(a);else if(Array.isArray(a)){if(a.length){var c=r.apply(null,a);c&&n.push(c)}}else if(i==="object"){if(a.toString!==Object.prototype.toString&&!a.toString.toString().includes("[native code]")){n.push(a.toString());continue}for(var s in a)t.call(a,s)&&a[s]&&n.push(s)}}}return n.join(" ")}e.exports?(r.default=r,e.exports=r):window.classNames=r})()})(Ze);var St=Ze.exports;const A=Ue(St);/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */var M=function(){return p.useContext(Xe).globalConfig};/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */function xt(e,t){return p.useMemo(function(){var r=Object.assign({},e);return Object.keys(t).forEach(function(n){r[n]===void 0&&(r[n]=t[n])}),r},[e,t])}var Ce={exports:{}},z={exports:{}};(function(){var e,t,r,n,o,a;typeof performance<"u"&&performance!==null&&performance.now?z.exports=function(){return performance.now()}:typeof process<"u"&&process!==null&&process.hrtime?(z.exports=function(){return(e()-o)/1e6},t=process.hrtime,e=function(){var i;return i=t(),i[0]*1e9+i[1]},n=e(),a=process.uptime()*1e9,o=n-a):Date.now?(z.exports=function(){return Date.now()-r},r=Date.now()):(z.exports=function(){return new Date().getTime()-r},r=new Date().getTime())}).call(qe);var Et=z.exports,Ct=Et,S=typeof window>"u"?qe:window,U=["moz","webkit"],L="AnimationFrame",R=S["request"+L],k=S["cancel"+L]||S["cancelRequest"+L];for(var F=0;!R&&F<U.length;F++)R=S[U[F]+"Request"+L],k=S[U[F]+"Cancel"+L]||S[U[F]+"CancelRequest"+L];if(!R||!k){var we=0,De=0,$=[],$t=1e3/60;R=function(e){if($.length===0){var t=Ct(),r=Math.max(0,$t-(t-we));we=r+t,setTimeout(function(){var n=$.slice(0);$.length=0;for(var o=0;o<n.length;o++)if(!n[o].cancelled)try{n[o].callback(we)}catch(a){setTimeout(function(){throw a},0)}},Math.round(r))}return $.push({handle:++De,callback:e,cancelled:!1}),De},k=function(e){for(var t=0;t<$.length;t++)$[t].handle===e&&($[t].cancelled=!0)}}Ce.exports=function(e){return R.call(S,e)};Ce.exports.cancel=function(){k.apply(S,arguments)};Ce.exports.polyfill=function(e){e||(e=S),e.requestAnimationFrame=R,e.cancelAnimationFrame=k};/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */var j=!!(typeof window<"u"&&window.document&&window.document.createElement),_t=function(t){return(t||"").replace(/^[\s\uFEFF]+|[\s\uFEFF]+$/g,"")},dr=function(){return j&&document.addEventListener?function(e,t,r){e&&t&&r&&e.addEventListener(t,r,!1)}:function(e,t,r){e&&t&&r&&e.attachEvent("on".concat(t),r)}}(),mr=function(){return j&&document.removeEventListener?function(e,t,r){e&&t&&e.removeEventListener(t,r,!1)}:function(e,t,r){e&&t&&e.detachEvent("on".concat(t),r)}}();function et(e,t){if(!e||!t)return!1;if(t.indexOf(" ")!==-1)throw new Error("className should not contain space.");return e.classList?e.classList.contains(t):" ".concat(e.className," ").indexOf(" ".concat(t," "))>-1}var jt=function(t,r){if(t){for(var n=t.className,o=(r||"").split(" "),a=0,i=o.length;a<i;a++){var c=o[a];c&&(t.classList?t.classList.add(c):et(t,c)||(n+=" ".concat(c)))}t.classList||(t.className=n)}},Pt=function(t,r){if(!(!t||!r)){for(var n=r.split(" "),o=" ".concat(t.className," "),a=0,i=n.length;a<i;a++){var c=n[a];c&&(t.classList?t.classList.remove(c):et(t,c)&&(o=o.replace(" ".concat(c," ")," ")))}t.classList||(t.className=_t(o))}};/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */function Tt(e,t){if(!j)return null;var r;return typeof e=="string"&&(r=document.querySelector(e)),typeof e=="function"&&(r=e(t)),Ye(e)==="object"&&e instanceof window.HTMLElement&&(r=e),r&&r.nodeType===1?r:document.body}var tt=p.forwardRef(function(e,t){var r=e.attach,n=e.children,o=e.triggerNode,a=M(),i=a.classPrefix,c=p.useMemo(function(){if(!j)return null;var s=document.createElement("div");return s.className="".concat(i,"-portal-wrapper"),s},[i]);return p.useEffect(function(){var s,l=Tt(r,o);return l==null||(s=l.appendChild)===null||s===void 0||s.call(l,c),function(){var m;l==null||(m=l.removeChild)===null||m===void 0||m.call(l,c)}},[c,r,o]),p.useImperativeHandle(t,function(){return c}),j?mt.createPortal(n,c):null});tt.displayName="Portal";/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */function At(){var e=p.useState(),t=Ee(e,2),r=t[0],n=t[1];return p.useCallback(function(o){o&&n(o)},[]),[r,n]}/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */function Ne(e,t){var r=Object.keys(t);r.forEach(function(n){e.style[n]=t[n]})}/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */function Lt(e){if(Array.isArray(e))return Se(e)}function Rt(e){if(typeof Symbol<"u"&&e[Symbol.iterator]!=null||e["@@iterator"]!=null)return Array.from(e)}function Mt(){throw new TypeError(`Invalid attempt to spread non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function xe(e){return Lt(e)||Rt(e)||Qe(e)||Mt()}/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */var It=yt,Dt=gt,Nt="[object Number]";function Ft(e){return typeof e=="number"||Dt(e)&&It(e)==Nt}var zt=Ft;/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */function rt(){if(typeof navigator>"u"||!navigator)return Number.MAX_SAFE_INTEGER;var e=navigator,t=e.userAgent,r=t.indexOf("compatible")>-1&&t.indexOf("MSIE")>-1,n=t.indexOf("Trident")>-1&&t.indexOf("rv:11.0")>-1;if(r){var o=new RegExp("MSIE (\\d+\\.\\d+);"),a=t.match(o);if(!a)return-1;var i=parseFloat(a[1]);return i<7?6:i}return n?11:Number.MAX_SAFE_INTEGER}function yr(){var e,t,r;if(typeof navigator>"u"||!navigator)return!1;var n=navigator.userAgent,o=n.match(/AppleWebKit.+Chrome\/(.+) Safari\/.+/i);if(Number(o==null||(e=o[1])===null||e===void 0?void 0:e.split(".")[0])<100)return!0;var a=n.match(/AppleWebKit.+Version\/(.+) Safari\/.+/i);if(Number(a==null||(t=a[1])===null||t===void 0?void 0:t.split(".")[0])<12)return!0;var i=rt();if(i<=11)return!0;var c=n.match(/Firefox\/(.+)/i);return Number(c==null||(r=c[1])===null||r===void 0?void 0:r.split(".")[0])<100}function gr(e,t){var r=zt(t);if(!e||e.length===0)return r?{length:0,characters:e}:0;for(var n=0,o=0;o<e.length;o++){var a=0;if(e.charCodeAt(o)>127?a=2:a=1,r&&n+a>t)return{length:n,characters:e.slice(0,o)};n+=a}return r?{length:n,characters:e}:n}function br(e){return xe(e??"").length}function hr(e,t,r){return xe(r??"").slice().length===t?r||"":xe(e??"").slice(0,t).join("")}/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */function Fe(e,t){var r=Object.keys(e);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(e);t&&(n=n.filter(function(o){return Object.getOwnPropertyDescriptor(e,o).enumerable})),r.push.apply(r,n)}return r}function X(e){for(var t=1;t<arguments.length;t++){var r=arguments[t]!=null?arguments[t]:{};t%2?Fe(Object(r),!0).forEach(function(n){_(e,n,r[n])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(r)):Fe(Object(r)).forEach(function(n){Object.defineProperty(e,n,Object.getOwnPropertyDescriptor(r,n))})}return e}function kt(e){var t,r,n,o={};if(!(!e||typeof window>"u")){var a=(t=window)===null||t===void 0||(r=t.getComputedStyle)===null||r===void 0?void 0:r.call(t,e),i=a.color,c=a.fontSize,s=(n=window)===null||n===void 0||(n=n.navigator)===null||n===void 0?void 0:n.userAgent,l=/Safari/.test(s)&&!/Chrome/.test(s),m=/(?=.*iPhone)[?=.*MicroMessenger]/.test(s)&&!/Chrome/.test(s);if((l||m)&&(o={transformOrigin:"0px 0px",transform:"scale(".concat(parseInt(c,10)/12,")")}),i&&rt()>11){var y=i.match(/[\d.]+/g),O=y?"rgba(".concat(y[0],", ").concat(y[1],", ").concat(y[2],", 0)"):"";Ne(e,X(X({},o),{},{background:"conic-gradient(from 90deg at 50% 50%,".concat(O," 0deg, ").concat(i," 360deg)")}))}else Ne(e,X(X({},o),{},{background:""}))}}/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */var Wt=function(){var t=M(),r=t.classPrefix,n=At(),o=Ee(n,2),a=o[0],i=o[1],c="".concat(r,"-loading__gradient");return p.useEffect(function(){var s=a;kt(s)},[a]),d.createElement("svg",{className:A(c,"".concat(r,"-icon-loading")),viewBox:"0 0 12 12",version:"1.1",width:"1em",height:"1em",xmlns:"http://www.w3.org/2000/svg"},d.createElement("foreignObject",{x:"0",y:"0",width:"12",height:"12"},d.createElement("div",{className:"".concat(c,"-conic"),ref:i})))};/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */var Gt={delay:0,fullscreen:!1,indicator:!0,inheritColor:!1,loading:!0,preventScrollThrough:!0,showOverlay:!0,size:"medium"};/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */function ze(e,t){var r=Object.keys(e);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(e);t&&(n=n.filter(function(o){return Object.getOwnPropertyDescriptor(e,o).enumerable})),r.push.apply(r,n)}return r}function T(e){for(var t=1;t<arguments.length;t++){var r=arguments[t]!=null?arguments[t]:{};t%2?ze(Object(r),!0).forEach(function(n){_(e,n,r[n])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(r)):ze(Object(r)).forEach(function(n){Object.defineProperty(e,n,Object.getOwnPropertyDescriptor(r,n))})}return e}var nt=function(t){var r=xt(t,Gt),n=r.attach,o=r.indicator,a=r.text,i=r.loading,c=r.size,s=r.delay,l=r.fullscreen,m=r.preventScrollThrough,y=r.showOverlay,O=r.content,x=r.children,I=r.inheritColor,w=r.zIndex,ye=r.className,P=r.style,D=p.useState(s?!1:i),E=Ee(D,2),W=E[0],N=E[1],G=M(),b=G.classPrefix,K="".concat(b,"-loading"),Re="".concat(b,"-loading--center"),ft="".concat(b,"-loading--inherit-color"),Me="".concat(b,"-loading--full"),lt="".concat(b,"-loading__fullscreen"),ge="".concat(b,"-loading--lock"),be="".concat(b,"-loading__overlay"),pt="".concat(b,"-loading__parent"),vt="".concat(b,"-loading__text");p.useEffect(function(){var C;return s&&i?C=setTimeout(function(){N(i)},s):N(i),function(){clearTimeout(C)}},[s,i]);var V=p.useMemo(function(){var C={};return w!==void 0&&(C.zIndex=w),["small","medium","large"].includes(c)||(C.fontSize=c),C},[c,w]),dt={large:"".concat(b,"-size-l"),small:"".concat(b,"-size-s"),medium:"".concat(b,"-size-m")},H=A(Re,dt[c],_({},ft,I),ye);p.useEffect(function(){return m&&l&&j&&i&&jt(document.body,ge),function(){Pt(document.body,ge)}},[i,m,l,ge]);var B=function(){var Ie=d.createElement(Wt,null);return o&&typeof o!="boolean"&&(Ie=o),d.createElement(d.Fragment,null,o?Ie:null,a?d.createElement("div",{className:vt},a):null)};return l?i?d.createElement("div",{className:A(K,lt,Re,be),style:T(T({},V),P)},d.createElement("div",{className:H},B())):null:O||x?d.createElement("div",{className:pt,style:P},O||x,W?d.createElement("div",{className:A(K,H,Me,_({},be,y)),style:V},B()):null):n?d.createElement(tt,{attach:n},i?d.createElement("div",{className:A(K,H,Me,_({},be,y)),style:T(T({},V),P)},B()):null):i?d.createElement("div",{className:A(K,H),style:T(T({},V),P)},B()):null};nt.displayName="Loading";/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */var wr=nt;/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */function Kt(){var e=M(),t=e.animation,r=he.expand,n=he.ripple,o=he.fade,a=p.useCallback(function(i){var c,s;return t&&!((c=t.exclude)!==null&&c!==void 0&&c.includes(i))&&((s=t.include)===null||s===void 0?void 0:s.includes(i))},[t]);return{keepExpand:a(r),keepRipple:a(n),keepFade:a(o)}}var ot={exports:{}},u={};/**
 * @license React
 * react-is.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var $e=Symbol.for("react.element"),_e=Symbol.for("react.portal"),Y=Symbol.for("react.fragment"),J=Symbol.for("react.strict_mode"),Q=Symbol.for("react.profiler"),Z=Symbol.for("react.provider"),ee=Symbol.for("react.context"),Vt=Symbol.for("react.server_context"),te=Symbol.for("react.forward_ref"),re=Symbol.for("react.suspense"),ne=Symbol.for("react.suspense_list"),oe=Symbol.for("react.memo"),ae=Symbol.for("react.lazy"),Ht=Symbol.for("react.offscreen"),at;at=Symbol.for("react.module.reference");function h(e){if(typeof e=="object"&&e!==null){var t=e.$$typeof;switch(t){case $e:switch(e=e.type,e){case Y:case Q:case J:case re:case ne:return e;default:switch(e=e&&e.$$typeof,e){case Vt:case ee:case te:case ae:case oe:case Z:return e;default:return t}}case _e:return t}}}u.ContextConsumer=ee;u.ContextProvider=Z;u.Element=$e;u.ForwardRef=te;u.Fragment=Y;u.Lazy=ae;u.Memo=oe;u.Portal=_e;u.Profiler=Q;u.StrictMode=J;u.Suspense=re;u.SuspenseList=ne;u.isAsyncMode=function(){return!1};u.isConcurrentMode=function(){return!1};u.isContextConsumer=function(e){return h(e)===ee};u.isContextProvider=function(e){return h(e)===Z};u.isElement=function(e){return typeof e=="object"&&e!==null&&e.$$typeof===$e};u.isForwardRef=function(e){return h(e)===te};u.isFragment=function(e){return h(e)===Y};u.isLazy=function(e){return h(e)===ae};u.isMemo=function(e){return h(e)===oe};u.isPortal=function(e){return h(e)===_e};u.isProfiler=function(e){return h(e)===Q};u.isStrictMode=function(e){return h(e)===J};u.isSuspense=function(e){return h(e)===re};u.isSuspenseList=function(e){return h(e)===ne};u.isValidElementType=function(e){return typeof e=="string"||typeof e=="function"||e===Y||e===Q||e===J||e===re||e===ne||e===Ht||typeof e=="object"&&e!==null&&(e.$$typeof===ae||e.$$typeof===oe||e.$$typeof===Z||e.$$typeof===ee||e.$$typeof===te||e.$$typeof===at||e.getModuleId!==void 0)};u.typeOf=h;ot.exports=u;var Or=ot.exports;/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */function Sr(){for(var e=arguments.length,t=new Array(e),r=0;r<e;r++)t[r]=arguments[r];return function(n){for(var o=0,a=t;o<a.length;o++){var i=a[o];typeof i=="function"?i(n):i&&(i.current=n)}}}/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */function ke(e,t){var r=Object.keys(t);r.forEach(function(n){e.style[n]=t[n]})}/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */var Oe=200,Bt="rgba(0, 0, 0, 0)",Ut="rgba(0, 0, 0, 0.35)",Xt=function(t,r){var n;if(r)return r;if(t!=null&&(n=t.dataset)!==null&&n!==void 0&&n.ripple){var o=t.dataset.ripple;return o}var a=getComputedStyle(t).getPropertyValue("--ripple-color");return a||Ut};function xr(e,t){var r=M(),n=r.classPrefix,o=Kt(),a=o.keepRipple,i=p.useMemo(function(){if(!j)return null;var s=document.createElement("div");return s.className="".concat(n,"-ripple"),s},[n]),c=p.useCallback(function(s){var l=Xt(e,t);if(!(s.button!==0||!e||!a)&&!(e.classList.contains("".concat(n,"-is-active"))||e.classList.contains("".concat(n,"-is-disabled"))||e.classList.contains("".concat(n,"-is-checked"))||e.classList.contains("".concat(n,"-is-loading")))){var m=getComputedStyle(e),y=parseInt(m.borderWidth,10),O=y>0?y:0,x=e.offsetWidth,I=e.offsetHeight;i.parentNode===null&&(ke(i,{position:"absolute",left:"".concat(0-O,"px"),top:"".concat(0-O,"px"),width:"".concat(x,"px"),height:"".concat(I,"px"),borderRadius:m.borderRadius,pointerEvents:"none",overflow:"hidden"}),e.appendChild(i));var w=document.createElement("div");w.className="".concat(n,"-ripple__inner"),ke(w,{marginTop:"0",marginLeft:"0",right:"".concat(x,"px"),width:"".concat(x+20,"px"),height:"100%",transition:"transform ".concat(Oe,"ms cubic-bezier(.38, 0, .24, 1), background ").concat(Oe*2,"ms linear"),transform:"skewX(-8deg)",pointerEvents:"none",position:"absolute",zIndex:0,backgroundColor:l,opacity:"0.9"});for(var ye=new WeakMap,P=e.children.length,D=0;D<P;++D){var E=e.children[D];E.style.zIndex===""&&E!==i&&(E.style.zIndex="1",ye.set(E,!0))}var W=e.style.position?e.style.position:getComputedStyle(e).position;(W===""||W==="static")&&(e.style.position="relative"),i.insertBefore(w,i.firstChild),setTimeout(function(){w.style.transform="translateX(".concat(x,"px)")},0);var N=function G(){w.style.backgroundColor=Bt,e&&(e.removeEventListener("pointerup",G,!1),e.removeEventListener("pointerleave",G,!1),setTimeout(function(){w.remove(),i.children.length===0&&i.remove()},Oe*2+100))};e.addEventListener("pointerup",N,!1),e.addEventListener("pointerleave",N,!1)}},[n,e,t,i,a]);p.useEffect(function(){if(e)return e.addEventListener("pointerdown",c,!1),function(){e.removeEventListener("pointerdown",c,!1)}},[c,t,e])}/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */var q=new Set,qt={warn:function(t,r){console.warn("TDesign ".concat(t," Warn: ").concat(r))},warnOnce:function(t,r){var n="TDesign ".concat(t," Warn: ").concat(r);q.has(n)||(q.add(n),console.warn(n))},error:function(t,r){console.error("TDesign ".concat(t," Error: ").concat(r))},errorOnce:function(t,r){var n="TDesign ".concat(t," Error: ").concat(r);q.has(n)||(q.add(n),console.error(n))},info:function(t,r){console.info("TDesign ".concat(t," Info: ").concat(r))}};/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */function We(e,t){var r=Object.keys(e);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(e);t&&(n=n.filter(function(o){return Object.getOwnPropertyDescriptor(e,o).enumerable})),r.push.apply(r,n)}return r}function Yt(e){for(var t=1;t<arguments.length;t++){var r=arguments[t]!=null?arguments[t]:{};t%2?We(Object(r),!0).forEach(function(n){_(e,n,r[n])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(r)):We(Object(r)).forEach(function(n){Object.defineProperty(e,n,Object.getOwnPropertyDescriptor(r,n))})}return e}function Er(e,t,r){var n=null;return typeof e=="function"?n=e(t):e===!0?n=r:e!==null&&(n=e??r),n}function Cr(e,t){if(Je(e))return e(t);if(!e||["string","number","boolean"].includes(Ye(e)))return e;try{return d.cloneElement(e,Yt({},t))}catch{return qt.warn("parseContentTNode","".concat(e," is not a valid ReactNode")),null}}var it={exports:{}},f={};/** @license React v16.13.1
 * react-is.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var v=typeof Symbol=="function"&&Symbol.for,je=v?Symbol.for("react.element"):60103,Pe=v?Symbol.for("react.portal"):60106,ie=v?Symbol.for("react.fragment"):60107,ce=v?Symbol.for("react.strict_mode"):60108,se=v?Symbol.for("react.profiler"):60114,ue=v?Symbol.for("react.provider"):60109,fe=v?Symbol.for("react.context"):60110,Te=v?Symbol.for("react.async_mode"):60111,le=v?Symbol.for("react.concurrent_mode"):60111,pe=v?Symbol.for("react.forward_ref"):60112,ve=v?Symbol.for("react.suspense"):60113,Jt=v?Symbol.for("react.suspense_list"):60120,de=v?Symbol.for("react.memo"):60115,me=v?Symbol.for("react.lazy"):60116,Qt=v?Symbol.for("react.block"):60121,Zt=v?Symbol.for("react.fundamental"):60117,er=v?Symbol.for("react.responder"):60118,tr=v?Symbol.for("react.scope"):60119;function g(e){if(typeof e=="object"&&e!==null){var t=e.$$typeof;switch(t){case je:switch(e=e.type,e){case Te:case le:case ie:case se:case ce:case ve:return e;default:switch(e=e&&e.$$typeof,e){case fe:case pe:case me:case de:case ue:return e;default:return t}}case Pe:return t}}}function ct(e){return g(e)===le}f.AsyncMode=Te;f.ConcurrentMode=le;f.ContextConsumer=fe;f.ContextProvider=ue;f.Element=je;f.ForwardRef=pe;f.Fragment=ie;f.Lazy=me;f.Memo=de;f.Portal=Pe;f.Profiler=se;f.StrictMode=ce;f.Suspense=ve;f.isAsyncMode=function(e){return ct(e)||g(e)===Te};f.isConcurrentMode=ct;f.isContextConsumer=function(e){return g(e)===fe};f.isContextProvider=function(e){return g(e)===ue};f.isElement=function(e){return typeof e=="object"&&e!==null&&e.$$typeof===je};f.isForwardRef=function(e){return g(e)===pe};f.isFragment=function(e){return g(e)===ie};f.isLazy=function(e){return g(e)===me};f.isMemo=function(e){return g(e)===de};f.isPortal=function(e){return g(e)===Pe};f.isProfiler=function(e){return g(e)===se};f.isStrictMode=function(e){return g(e)===ce};f.isSuspense=function(e){return g(e)===ve};f.isValidElementType=function(e){return typeof e=="string"||typeof e=="function"||e===ie||e===le||e===se||e===ce||e===ve||e===Jt||typeof e=="object"&&e!==null&&(e.$$typeof===me||e.$$typeof===de||e.$$typeof===ue||e.$$typeof===fe||e.$$typeof===pe||e.$$typeof===Zt||e.$$typeof===er||e.$$typeof===tr||e.$$typeof===Qt)};f.typeOf=g;it.exports=f;var rr=it.exports,Ae=rr,nr={childContextTypes:!0,contextType:!0,contextTypes:!0,defaultProps:!0,displayName:!0,getDefaultProps:!0,getDerivedStateFromError:!0,getDerivedStateFromProps:!0,mixins:!0,propTypes:!0,type:!0},or={name:!0,length:!0,prototype:!0,caller:!0,callee:!0,arguments:!0,arity:!0},ar={$$typeof:!0,render:!0,defaultProps:!0,displayName:!0,propTypes:!0},st={$$typeof:!0,compare:!0,defaultProps:!0,displayName:!0,propTypes:!0,type:!0},Le={};Le[Ae.ForwardRef]=ar;Le[Ae.Memo]=st;function Ge(e){return Ae.isMemo(e)?st:Le[e.$$typeof]||nr}var ir=Object.defineProperty,cr=Object.getOwnPropertyNames,Ke=Object.getOwnPropertySymbols,sr=Object.getOwnPropertyDescriptor,ur=Object.getPrototypeOf,Ve=Object.prototype;function ut(e,t,r){if(typeof t!="string"){if(Ve){var n=ur(t);n&&n!==Ve&&ut(e,n,r)}var o=cr(t);Ke&&(o=o.concat(Ke(t)));for(var a=Ge(e),i=Ge(t),c=0;c<o.length;++c){var s=o[c];if(!or[s]&&!(r&&r[s])&&!(i&&i[s])&&!(a&&a[s])){var l=sr(t,s);try{ir(e,s,l)}catch{}}}}return e}var fr=ut;const lr=Ue(fr);/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */function $r(e,t){return lr(p.forwardRef(e),t)}/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */function _r(e){var t=M(),r=t.icon,n={};return Object.keys(e).forEach(function(o){n[o]=(r==null?void 0:r[o])||e[o]}),n}/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */function He(e,t){var r=Object.keys(e);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(e);t&&(n=n.filter(function(o){return Object.getOwnPropertyDescriptor(e,o).enumerable})),r.push.apply(r,n)}return r}function Be(e){for(var t=1;t<arguments.length;t++){var r=arguments[t]!=null?arguments[t]:{};t%2?He(Object(r),!0).forEach(function(n){_(e,n,r[n])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(r)):He(Object(r)).forEach(function(n){Object.defineProperty(e,n,Object.getOwnPropertyDescriptor(r,n))})}return e}function jr(e,t){var r=d.useContext(Xe),n=r.globalConfig;function o(i,c){var s=/\{\s*([\w-]+)\s*\}/g;if(typeof i=="string"){if(!c||!s.test(i))return i;var l=i.replace(s,function(m,y){return c?String(c[y]):""});return l}return Array.isArray(i)?i.map(function(m,y){var O=m.replace(s,function(x,I){return c?String(c[y][I]):""});return O}):typeof i=="function"?i(c):""}var a=d.useMemo(function(){var i=t||{},c=n[e],s=e&&n?c:{};return Be(Be({},typeof i=="function"?i():i),s||{})},[e,t,n]);return[a,o]}/**
 * tdesign v1.5.5
 * (c) 2024 tdesign
 * @license MIT
 */function Pr(e,t){var r=null,n=function(){!r||!e||(r.unobserve(e),Je(r.disconnect)&&r.disconnect(),r=null)},o=function(i){r=new ResizeObserver(t),r.observe(i)};p.useLayoutEffect(function(){var a=typeof window<"u"&&window.ResizeObserver;if(a)return n(),e&&o(e),function(){n()}},[e,r])}export{wr as L,tt as P,Ee as _,M as a,vr as b,A as c,jr as d,_r as e,$r as f,yr as g,Pr as h,Sr as i,zt as j,xe as k,qt as l,mr as m,At as n,dr as o,Er as p,xr as q,Or as r,Kt as s,j as t,xt as u,br as v,gr as w,hr as x,Cr as y};
