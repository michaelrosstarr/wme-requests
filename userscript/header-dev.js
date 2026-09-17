// ==UserScript==
// @name         WME Requests (dev)
// @namespace    https://github.com/michaelrosstarr/wme-requests
// @version      2.8.1
// @description  Local development build — loads the compiled TypeScript straight from .out/main.user.js.
// @author       michaelrosstarr
// @match        https://www.waze.com/editor*
// @match        https://www.waze.com/*/editor*
// @match        https://beta.waze.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_info
// @grant        unsafeWindow
// @license MIT
// @connect      requests.wazetools.com
// @connect      localhost

// @require      file:///ABSOLUTE/PATH/TO/wme-requests/userscript/.out/main.user.js
// ==/UserScript==

// Local dev header — not published anywhere.
//
// 1. Run `npm run watch` in userscript/ to keep .out/main.user.js up to date.
// 2. Enable "Allow access to file URLs" for Tampermonkey:
//    https://www.tampermonkey.net/faq.php?locale=en#Q204
// 3. Replace the @require path above with the absolute path to this repo's
//    userscript/.out/main.user.js on your machine, then paste this whole file
//    into a new Tampermonkey script.
// 4. Reloading the WME tab picks up the latest compiled output — no reinstall needed.
