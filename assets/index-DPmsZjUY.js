import{u as x,b as g,r as n,j as e}from"./index-mxYnnJSI.js";import"./Editor-_xoWGhQX.js";import{u as k,W as d}from"./useShikitorCreate-Dzv-TURH.js";import{S as b}from"./index-Cx0_TQkr.js";import"./index-DH-3xqSB.js";import"./index-Cln5e4OZ.js";import"./index-C4PaMROx.js";import"./useResizeObserver-TNRxJNdE.js";const u={typescript:`interface ThemeToken {
  name: string
  value: string
}

const accent: ThemeToken = {
  name: 'accent',
  value: '#8b7df2'
}

export const resolveToken = () => accent.value`,javascript:`const accent = {
  name: 'accent',
  value: '#8b7df2'
}

export const resolveToken = () => accent.value`,json:`{
  "name": "Shikitor",
  "theme": "github-dark",
  "features": ["editing", "rendering", "plugins"]
}`,markdown:`# Shikitor

Edit this **Markdown** source and inspect the synchronized rendering.

- Cordis plugins
- Shiki highlighting
- Exact source projection`,css:`.shikitor-demo {
  color: #8b7df2;
  display: grid;
  gap: 0.75rem;
}`},S=[{label:"TypeScript",value:"typescript"},{label:"JavaScript",value:"javascript"},{label:"JSON",value:"json"},{label:"Markdown",value:"markdown"},{label:"CSS",value:"css"}];function _(){const{t:r}=x(),a=k(),o=(g().value.theme==="dark"?"dark":"light")==="dark"?"github-dark":"github-light",[s,h]=n.useState("typescript"),[p,m]=n.useState(()=>({...u})),l=p[s],i=n.useMemo(()=>({language:s,theme:o,lineNumbers:"on",hideSelfCursorUsername:!0}),[o,s]),v=n.useMemo(()=>({...i,readOnly:!0}),[i]),c=t=>{m(j=>({...j,[s]:t}))};return e.jsxs("div",{className:"live-renderer-demo",children:[e.jsxs("section",{className:"live-renderer-hero",children:[e.jsxs("div",{children:[e.jsx("span",{className:"live-renderer-eyebrow",children:r("liveRenderer.eyebrow")}),e.jsx("h2",{children:r("liveRenderer.title")}),e.jsx("p",{children:r("liveRenderer.description")})]}),e.jsxs("div",{className:"live-renderer-hero__actions",children:[e.jsxs("label",{children:[e.jsx("span",{children:r("liveRenderer.language")}),e.jsx(b,{value:s,options:S,onChange:t=>h(t)})]}),e.jsxs("button",{type:"button",onClick:()=>c(u[s]),children:[e.jsx("span",{className:"shikitor-icon",children:"restart_alt"}),r("liveRenderer.reset")]})]})]}),e.jsxs("section",{className:"live-renderer-workbench",children:[e.jsxs("div",{className:"live-renderer-pane live-renderer-pane--source",children:[e.jsxs("header",{children:[e.jsxs("span",{children:[e.jsx("span",{className:"shikitor-icon",children:"code_blocks"}),r("liveRenderer.source")]}),e.jsx("small",{children:r("liveRenderer.editable")})]}),e.jsx(d,{create:a,value:l,onChange:c,options:i})]}),e.jsxs("div",{className:"live-renderer-pane live-renderer-pane--output",children:[e.jsxs("header",{children:[e.jsxs("span",{children:[e.jsx("span",{className:"shikitor-icon",children:"data_object"}),r("liveRenderer.output")]}),e.jsxs("small",{children:[e.jsx("i",{}),r("liveRenderer.synced"),e.jsx("b",{children:r("liveRenderer.readOnly")})]})]}),e.jsx(d,{create:a,value:l,options:v})]})]})]})}export{_ as default};
