import{u as R,b as S,r as n,j as t}from"./index-mxYnnJSI.js";import{c as C,d as N}from"./index-ClGfUJVZ.js";import"./Editor-_xoWGhQX.js";import{u as D,W as y}from"./useShikitorCreate-Dzv-TURH.js";import"./index-DH-3xqSB.js";import"./index-Cln5e4OZ.js";import"./index-C4PaMROx.js";import"./plugin-DeQo96Nv.js";import"./line-widgets-DEkRAN6J.js";import"./cursor-geometry-layer-9MBZAdKs.js";const l=`export interface ReviewOptions {
  theme: 'light' | 'dark'
  compact: boolean
}

const defaults: ReviewOptions = {
  theme: 'light',
  compact: true
}

const reviewStages = ['draft', 'review', 'approved'] as const

function isReviewStage(value: string) {
  return reviewStages.includes(value as typeof reviewStages[number])
}

function normalizeReviewer(name: string) {
  return name.trim().toLowerCase()
}

function formatLabel(name: string) {
  return name.toUpperCase()
}

export function createReview(options = defaults) {
  return { label: formatLabel('Diff'), options }
}`,a=`export interface ReviewOptions {
  theme: 'light' | 'dark'
  mode: 'unified' | 'split'
}

const defaults: ReviewOptions = {
  theme: 'dark',
  mode: 'split'
}

const reviewStages = ['draft', 'review', 'approved'] as const

function isReviewStage(value: string) {
  return reviewStages.includes(value as typeof reviewStages[number])
}

function normalizeReviewer(name: string) {
  return name.trim().toLowerCase()
}

export function createReview(options = defaults) {
  return { label: 'Diff review', options }
}

export function acceptHunk(id: string) {
  return { id, accepted: true }
}`;function W(){const{t:i}=R(),v=D(),{value:g}=S(),d=g.theme==="dark"?"github-dark":"github-light",c=n.useRef(),r=n.useRef(),[x,u]=n.useState(a),[s,w]=n.useState("unified"),f=n.useRef(s);f.current=s;const[o,p]=n.useState(()=>C(l,a)),b=n.useMemo(()=>({language:"typescript",theme:d,lineNumbers:"on",hideSelfCursorUsername:!0}),[d]),k=n.useMemo(()=>[[N,{original:l,get view(){return f.current},inline:"word",hunkActions:{accept:i("diff.acceptHunk"),reject:i("diff.revertHunk")},collapseUnchanged:{context:1,minimum:4,collapseLabel:i("diff.collapseUnchanged"),expandLabel:i("diff.expandUnchanged"),label:e=>i("diff.unchangedLines",{count:e})},onDiffChange:p}]],[i]),h=e=>{var m;w(e),(m=r.current)==null||m.setView(e)},j=()=>{var e;(e=r.current)==null||e.setOriginal(l),c.current&&(c.current.value=a),u(a),h("unified")};return t.jsx("div",{className:"diff-editor-demo",children:t.jsxs("section",{className:"diff-editor-workbench",children:[t.jsxs("header",{className:"diff-editor-toolbar",children:[t.jsxs("div",{className:"diff-editor-file",children:[t.jsx("span",{className:"shikitor-icon","aria-hidden":"true",children:"difference"}),t.jsx("strong",{children:i("diff.file")}),t.jsx("span",{className:"diff-editor-stats","aria-live":"polite",children:o.identical?i("diff.noChanges"):t.jsxs(t.Fragment,{children:[t.jsx("b",{children:i("diff.additions",{count:o.stats.additions})}),t.jsx("i",{children:i("diff.deletions",{count:o.stats.deletions})}),t.jsx("span",{children:i("diff.hunks",{count:o.stats.hunks})})]})})]}),t.jsxs("div",{className:"diff-editor-actions",children:[t.jsx("div",{className:"diff-editor-view",role:"group","aria-label":"Diff view",children:["unified","split"].map(e=>t.jsx("button",{type:"button","aria-pressed":s===e,onClick:()=>h(e),children:i(`diff.${e}`)},e))}),t.jsxs("button",{type:"button",onClick:()=>{var e;return(e=r.current)==null?void 0:e.acceptAll()},children:[t.jsx("span",{className:"shikitor-icon","aria-hidden":"true",children:"done_all"}),i("diff.acceptAll")]}),t.jsxs("button",{type:"button",onClick:()=>{var e;return void((e=r.current)==null?void 0:e.rejectAll())},children:[t.jsx("span",{className:"shikitor-icon","aria-hidden":"true",children:"undo"}),i("diff.revertAll")]}),t.jsxs("button",{type:"button",onClick:j,children:[t.jsx("span",{className:"shikitor-icon","aria-hidden":"true",children:"restart_alt"}),i("diff.reset")]})]})]}),t.jsx(y,{create:v,value:x,onChange:u,options:b,plugins:k,onMounted:e=>{c.current=e,r.current=e.context.shikitorDiff,e.context.shikitorDiff.setView(s),p(e.context.shikitorDiff.model)}})]})})}export{W as default};
