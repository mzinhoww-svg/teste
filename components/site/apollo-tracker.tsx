import Script from "next/script";

// Website tracker do Apollo.io. O snippet oficial injeta o tracker.iife.js no
// <head> e chama `trackingFunctions.onLoad` com o appId da conta; o `nocache`
// aleatório evita cache do bundle entre deploys.
const APOLLO_APP_ID = "6a5a65b90b29f90014cd4f22";

const initApollo = `function initApollo(){var n=Math.random().toString(36).substring(7),o=document.createElement("script");
o.src="https://assets.apollo.io/micro/website-tracker/tracker.iife.js?nocache="+n,o.async=!0,o.defer=!0,
o.onload=function(){window.trackingFunctions.onLoad({appId:"${APOLLO_APP_ID}"})},
document.head.appendChild(o)}initApollo();`;

/** Carrega o tracker do Apollo depois da hidratação, sem bloquear o render. */
export function ApolloTracker() {
  return (
    <Script id="apollo-tracker" strategy="afterInteractive">
      {initApollo}
    </Script>
  );
}
