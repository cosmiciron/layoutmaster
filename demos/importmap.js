const useLocalLayoutmaster = new URLSearchParams(window.location.search).has("local");
const layoutmasterUrl = useLocalLayoutmaster
  ? "/src/index.js"
  : "https://esm.sh/@layoutmaster/layoutmaster";

document.write(`<script type="importmap">
{
  "imports": {
    "@layoutmaster/layoutmaster": ${JSON.stringify(layoutmasterUrl)}
  }
}
<\/script>`);
