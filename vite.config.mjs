import {defineConfig} from 'vite';
// Pages 使用相对路径，兼容 /仓库名/ 和独立域名。
export default defineConfig(({mode})=>({
  base:mode==='pages'?'./':'/',
  define:{'import.meta.env.VITE_STATIC_SITE':JSON.stringify(mode==='pages'?'true':'false')},
  server:{host:'0.0.0.0',port:3000,allowedHosts:true},
  esbuild:{jsx:'automatic'},build:{outDir:'dist'}
}));
