// Website tracker do Apollo.io. O snippet oficial injeta o tracker.iife.js no
// <head> e chama `trackingFunctions.onLoad` com o appId da conta; o `nocache`
// aleatório evita cache do bundle entre deploys.
//
// Vai como <script> inline no HTML (mesmo padrão do themeInit em app/layout.tsx)
// em vez de next/script: com `strategy="afterInteractive"` o código só sai no
// payload RSC e roda depois da hidratação, o que (a) não aparece no "ver código
// fonte" — quebrando a verificação de instalação do Apollo e checadores de pixel
// que não executam JS — e (b) perde a visita de quem sai antes de hidratar.
// O tracker em si continua async/defer, então nada disso bloqueia o render.
const APOLLO_APP_ID = "6a5a65b90b29f90014cd4f22";

const initApollo = `function initApollo(){var n=Math.random().toString(36).substring(7),o=document.createElement("script");
o.src="https://assets.apollo.io/micro/website-tracker/tracker.iife.js?nocache="+n,o.async=!0,o.defer=!0,
o.onload=function(){window.trackingFunctions.onLoad({appId:"${APOLLO_APP_ID}"})},
document.head.appendChild(o)}initApollo();`;

/** Carrega o tracker do Apollo. Sem bloquear o render: o script é async + defer. */
export function ApolloTracker() {
  return <script dangerouslySetInnerHTML={{ __html: initApollo }} />;
}
