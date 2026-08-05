/**
 * Shared Swagger UI presentation for every Iveri API.
 *
 * The OpenAPI document belongs to each service, but the operator experience should not change
 * from one API to the next. Keep the UI defaults here so a new service cannot accidentally
 * reopen every operation or inherit a dark browser theme.
 *
 * Theme rules:
 * - Light: white canvas, slate type, one blue accent (Execute)
 * - Manual Dark/Light toggle in the topbar (persisted); text contrast follows the theme
 * - Method color only on the verb pill (no rainbow row backgrounds)
 * - Closed operation rows stay compact
 *
 * The companion script must be served same-origin (see SWAGGER_UI_CUSTOM_JS_PATH). Nest's
 * `customJsUrl` / inline script options are blocked by CSP; mount the JS string on that path.
 */
export const SWAGGER_UI_OPTIONS = {
    persistAuthorization: true,
    docExpansion: 'none',
    tagsSorter: 'alpha',
    operationsSorter: 'alpha',
    defaultModelsExpandDepth: -1,
} as const;

/** Same-origin path every service should mount for SWAGGER_UI_CUSTOM_JS. */
export const SWAGGER_UI_CUSTOM_JS_PATH = '/docs/swagger-ui.js';

export const SWAGGER_UI_CUSTOM_CSS = `
/* ========== Base layout ========== */

html,
body,
.swagger-ui {
    background: #ffffff !important;
    color: #0f172a !important;
}

.swagger-ui {
    max-width: 1120px;
    margin: 0 auto;
    padding: 0 20px 56px;
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 14px;
    line-height: 1.5;
}

.swagger-ui .wrapper {
    max-width: 1120px;
    padding: 0;
}

.swagger-ui .topbar {
    min-height: 56px;
    margin: 0 -20px 8px;
    padding: 0 20px;
    background: #0f172a !important;
    border-bottom: 1px solid #0f172a !important;
    box-shadow: none !important;
}

.swagger-ui .topbar .wrapper {
    display: flex;
    align-items: center;
    gap: 16px;
    min-height: 56px;
    padding: 0;
}

.swagger-ui .topbar a,
.swagger-ui .topbar .link {
    display: flex;
    align-items: center;
    min-height: 56px;
    color: #f8fafc !important;
    font-weight: 650;
    letter-spacing: 0.01em;
}

.swagger-ui .topbar .download-url-wrapper {
    display: none !important;
}

.swagger-ui .topbar .link img {
    display: none !important;
}

.swagger-ui .info {
    margin: 28px 0 20px !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
}

.swagger-ui .info .title {
    margin: 0 0 10px;
    color: #0f172a !important;
    font-size: 26px !important;
    font-weight: 750 !important;
    letter-spacing: -0.03em !important;
}

.swagger-ui .info .title small {
    display: inline-flex;
    align-items: center;
    margin-left: 8px;
    padding: 2px 8px;
    border: 1px solid #e2e8f0;
    border-radius: 999px;
    background: #f8fafc !important;
    color: #475569 !important;
    font-size: 11px !important;
    font-weight: 650;
    letter-spacing: 0.02em;
    vertical-align: middle;
}

.swagger-ui .info .description,
.swagger-ui .markdown,
.swagger-ui .renderedMarkdown {
    max-width: 68ch;
    color: #475569 !important;
    font-size: 14px;
    line-height: 1.65;
}

.swagger-ui .info a,
.swagger-ui .markdown a,
.swagger-ui .renderedMarkdown a {
    color: #2563eb !important;
    font-weight: 600;
}

.swagger-ui .markdown code,
.swagger-ui .renderedMarkdown code {
    padding: 1px 5px;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    background: #f8fafc !important;
    color: #0f172a !important;
    font-size: 12px;
}

.swagger-ui section.models {
    margin-top: 28px;
    border: 1px solid #e2e8f0 !important;
    border-radius: 10px !important;
    background: #ffffff !important;
    box-shadow: none !important;
}

.swagger-ui section.models h4,
.swagger-ui .models-control {
    color: #0f172a !important;
}

/* ========== Light chrome ========== */

.swagger-ui .iveri-theme-toggle {
    margin-left: auto;
    min-width: 88px;
    min-height: 32px;
    padding: 0 12px;
    border: 1px solid rgb(255 255 255 / 28%);
    border-radius: 8px;
    background: rgb(255 255 255 / 8%);
    color: #f8fafc;
    cursor: pointer;
    font-size: 12px;
    font-weight: 650;
    letter-spacing: 0.01em;
}

.swagger-ui .iveri-theme-toggle:hover {
    background: rgb(255 255 255 / 16%);
}


.swagger-ui .scheme-container {
    margin: 0 0 20px !important;
    padding: 12px 0 !important;
    background: transparent !important;
    box-shadow: none !important;
}

.swagger-ui .auth-wrapper {
    display: flex;
    justify-content: flex-end;
}

.swagger-ui .btn.authorize {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 8px !important;
    min-width: 132px;
    min-height: 40px;
    padding: 0 16px !important;
    border: 1px solid #0f172a !important;
    border-radius: 8px !important;
    background: #0f172a !important;
    color: #ffffff !important;
    font-size: 13px !important;
    font-weight: 700 !important;
    box-shadow: none !important;
}

.swagger-ui .btn.authorize svg {
    display: block;
    width: 14px;
    height: 14px;
    margin: 0 !important;
    fill: #34d399 !important;
}

.swagger-ui .btn.authorize:hover {
    background: #1e293b !important;
    border-color: #1e293b !important;
    color: #ffffff !important;
}

.swagger-ui .authorization__btn {
    margin-right: 8px;
}

.swagger-ui .authorization__btn svg {
    fill: #64748b !important;
}

.swagger-ui .opblock-tag-section {
    margin: 0 0 6px;
}

.swagger-ui .opblock-tag {
    min-height: 36px !important;
    margin: 0 !important;
    padding: 8px 12px !important;
    border: 1px solid #e2e8f0 !important;
    border-radius: 8px !important;
    background: #ffffff !important;
    box-shadow: none !important;
    font-size: 14px !important;
    font-weight: 700 !important;
    color: #0f172a !important;
    transform: none !important;
}

.swagger-ui .opblock-tag:hover {
    border-color: #cbd5e1 !important;
    background: #f8fafc !important;
    box-shadow: none !important;
    transform: none !important;
}

.swagger-ui .opblock-tag small {
    color: #64748b !important;
    font-size: 12px !important;
    font-weight: 500 !important;
}

.swagger-ui .opblock {
    margin: 4px 0 !important;
    border: 1px solid #e2e8f0 !important;
    border-radius: 8px !important;
    background: #ffffff !important;
    box-shadow: none !important;
    overflow: hidden;
}

/* Kill Swagger's default method-tinted row backgrounds — color lives on the verb pill only. */
.swagger-ui .opblock.opblock-get,
.swagger-ui .opblock.opblock-post,
.swagger-ui .opblock.opblock-put,
.swagger-ui .opblock.opblock-patch,
.swagger-ui .opblock.opblock-delete,
.swagger-ui .opblock.opblock-head,
.swagger-ui .opblock.opblock-options {
    border-color: #e2e8f0 !important;
    background: #ffffff !important;
}

.swagger-ui .opblock.opblock-get .opblock-summary,
.swagger-ui .opblock.opblock-post .opblock-summary,
.swagger-ui .opblock.opblock-put .opblock-summary,
.swagger-ui .opblock.opblock-patch .opblock-summary,
.swagger-ui .opblock.opblock-delete .opblock-summary,
.swagger-ui .opblock.opblock-head .opblock-summary,
.swagger-ui .opblock.opblock-options .opblock-summary {
    border-color: transparent !important;
    background: #ffffff !important;
}

.swagger-ui .opblock .opblock-summary {
    min-height: 36px !important;
    padding: 4px 10px !important;
    border: 0 !important;
    background: #ffffff !important;
}

.swagger-ui .opblock-summary-control {
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.swagger-ui .opblock-summary-method {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex: 0 0 58px;
    min-height: 22px;
    padding: 0 6px !important;
    border-radius: 4px !important;
    box-shadow: none !important;
    font-size: 10px !important;
    font-weight: 800 !important;
    letter-spacing: 0.06em;
    text-shadow: none !important;
}

.swagger-ui .opblock-get .opblock-summary-method { background: #0284c7 !important; }
.swagger-ui .opblock-post .opblock-summary-method { background: #059669 !important; }
.swagger-ui .opblock-put .opblock-summary-method,
.swagger-ui .opblock-patch .opblock-summary-method { background: #d97706 !important; }
.swagger-ui .opblock-delete .opblock-summary-method { background: #e11d48 !important; }
.swagger-ui .opblock-head .opblock-summary-method,
.swagger-ui .opblock-options .opblock-summary-method { background: #475569 !important; }

.swagger-ui .opblock-summary-path {
    min-width: 0;
    color: #0f172a !important;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
    font-size: 12px !important;
    font-weight: 600 !important;
}

.swagger-ui .opblock-summary-description {
    color: #64748b !important;
    font-size: 12px !important;
    font-weight: 500 !important;
}

.swagger-ui .opblock-body {
    padding: 0 16px 16px !important;
    background: #ffffff !important;
}

.swagger-ui .opblock-section-header {
    margin: 0 -16px 14px;
    padding: 12px 16px !important;
    border-top: 1px solid #e2e8f0;
    border-bottom: 1px solid #e2e8f0;
    background: #f8fafc !important;
    box-shadow: none !important;
}

.swagger-ui .opblock-section-header h4,
.swagger-ui .opblock-section-header label {
    color: #0f172a !important;
    font-size: 13px !important;
    font-weight: 700 !important;
}

.swagger-ui .parameters thead tr th,
.swagger-ui .parameters thead tr td,
.swagger-ui .responses-table thead tr th,
.swagger-ui .responses-table thead tr td {
    border-bottom: 1px solid #e2e8f0 !important;
    background: #f8fafc !important;
    color: #475569 !important;
    font-size: 11px !important;
    font-weight: 700 !important;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.swagger-ui .parameter__name {
    color: #0f172a !important;
    font-size: 13px !important;
    font-weight: 700 !important;
}

.swagger-ui .parameter__name.required {
    color: #be123c !important;
}

.swagger-ui .parameter__type,
.swagger-ui .prop-type {
    color: #2563eb !important;
    font-size: 12px !important;
}

.swagger-ui .parameters-col_description,
.swagger-ui .parameters-col_description p {
    color: #475569 !important;
    font-size: 13px !important;
    line-height: 1.55 !important;
}

.swagger-ui .response-col_status {
    color: #047857 !important;
    font-weight: 750 !important;
}

.swagger-ui .tab {
    border-bottom: 1px solid #e2e8f0;
}

.swagger-ui .tab li button.tablinks {
    color: #64748b !important;
    font-weight: 650 !important;
}

.swagger-ui .tab li.active button.tablinks {
    color: #0f172a !important;
}

.swagger-ui .model-example {
    position: relative !important;
    margin-top: 8px;
    padding: 44px 12px 12px !important;
    border: 1px solid #e2e8f0 !important;
    border-radius: 8px !important;
    background: #f8fafc !important;
}

.swagger-ui .highlight-code {
    position: relative !important;
    padding-top: 44px !important;
}

.swagger-ui .microlight,
.swagger-ui pre.microlight,
.swagger-ui .model-example pre,
.swagger-ui .response-col_description__inner pre {
    border: 1px solid #e2e8f0 !important;
    border-radius: 8px !important;
    background: #f8fafc !important;
    color: #0f172a !important;
    text-shadow: none !important;
}

.swagger-ui .microlight *,
.swagger-ui pre.microlight * {
    background: transparent !important;
    text-shadow: none !important;
}

.swagger-ui .iveri-copy-json {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 5;
    min-width: 88px;
    min-height: 30px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #ffffff;
    color: #0f172a;
    cursor: pointer;
    font-size: 12px;
    font-weight: 650;
}

.swagger-ui .iveri-copy-json:hover {
    border-color: #94a3b8;
    background: #f8fafc;
}

.swagger-ui .iveri-copy-json.is-copied {
    border-color: #6ee7b7;
    background: #ecfdf5;
    color: #047857;
}

.swagger-ui .highlight-code .copy-to-clipboard,
.swagger-ui .curl-command .copy-to-clipboard {
    display: flex !important;
    visibility: visible !important;
    opacity: 1 !important;
    top: 10px !important;
    right: 10px !important;
    bottom: auto !important;
    width: 88px !important;
    height: 30px !important;
    border: 1px solid #cbd5e1 !important;
    border-radius: 6px !important;
    background: #ffffff !important;
    box-shadow: none !important;
    z-index: 3 !important;
}

.swagger-ui .highlight-code .copy-to-clipboard button,
.swagger-ui .curl-command .copy-to-clipboard button {
    width: 100% !important;
    height: 100% !important;
    border: 0 !important;
    background: transparent !important;
    background-image: none !important;
    color: transparent !important;
    font-size: 0 !important;
}

.swagger-ui .highlight-code .copy-to-clipboard button::before,
.swagger-ui .curl-command .copy-to-clipboard button::before {
    content: none !important;
}

.swagger-ui .highlight-code .copy-to-clipboard::after,
.swagger-ui .curl-command .copy-to-clipboard::after {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    content: "Copy JSON";
    color: #0f172a !important;
    font-size: 12px !important;
    font-weight: 650 !important;
    pointer-events: none;
    z-index: 4;
}

.swagger-ui .opblock .opblock-summary .view-line-link.copy-to-clipboard {
    display: none !important;
}

.swagger-ui .dialog-ux .backdrop-ux {
    background: rgb(15 23 42 / 45%) !important;
}

.swagger-ui .dialog-ux .modal-ux {
    width: min(520px, calc(100vw - 32px));
    border: 1px solid #e2e8f0 !important;
    border-radius: 12px !important;
    background: #ffffff !important;
    box-shadow: 0 20px 50px rgb(15 23 42 / 18%) !important;
    overflow: hidden;
}

.swagger-ui .dialog-ux .modal-ux-header {
    padding: 18px 20px !important;
    border-bottom: 1px solid #e2e8f0 !important;
    background: #ffffff !important;
}

.swagger-ui .dialog-ux .modal-ux-header h3 {
    color: #0f172a !important;
    font-size: 17px !important;
    font-weight: 750 !important;
}

.swagger-ui .dialog-ux .modal-ux-close {
    color: #64748b !important;
}

.swagger-ui .dialog-ux .modal-ux-content {
    padding: 20px !important;
    background: #ffffff !important;
}

.swagger-ui .auth-container {
    margin: 0 !important;
    padding: 14px !important;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #f8fafc !important;
}

.swagger-ui .auth-container h4,
.swagger-ui .auth-container label {
    color: #0f172a !important;
}

.swagger-ui .auth-container p {
    color: #64748b !important;
}

.swagger-ui .auth-container input {
    min-height: 40px;
    border: 1px solid #cbd5e1 !important;
    border-radius: 8px !important;
    background: #ffffff !important;
    color: #0f172a !important;
}

.swagger-ui .auth-btn-wrapper {
    display: flex;
    gap: 10px;
    padding-top: 16px !important;
}

.swagger-ui .auth-btn-wrapper .btn {
    min-height: 38px;
    border-radius: 8px !important;
}

.swagger-ui .auth-btn-wrapper .btn.authorize {
    background: #0f172a !important;
    border-color: #0f172a !important;
    color: #ffffff !important;
}

.swagger-ui .auth-btn-wrapper .btn.modal-btn {
    background: #ffffff !important;
    border: 1px solid #cbd5e1 !important;
    color: #0f172a !important;
}

.swagger-ui input,
.swagger-ui select,
.swagger-ui textarea,
.swagger-ui .body-param__text {
    border: 1px solid #cbd5e1 !important;
    border-radius: 8px !important;
    background: #ffffff !important;
    color: #0f172a !important;
    box-shadow: none !important;
}

.swagger-ui .btn.execute {
    background: #2563eb !important;
    border-color: #2563eb !important;
    color: #ffffff !important;
}

/* ========== Dark (html.iveri-dark-mode via topbar toggle) ========== */

html.iveri-dark-mode,
html.iveri-dark-mode body,
html.iveri-dark-mode .swagger-ui {
    color-scheme: dark !important;
    background: #0b1220 !important;
    color: #e2e8f0 !important;
}

html.iveri-dark-mode .swagger-ui .topbar {
    background: #020617 !important;
    border-bottom-color: #1e293b !important;
}

html.iveri-dark-mode .swagger-ui .info {
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
}

html.iveri-dark-mode .swagger-ui .info .title,
html.iveri-dark-mode .swagger-ui .info .description,
html.iveri-dark-mode .swagger-ui .info .description p,
html.iveri-dark-mode .swagger-ui .info .description li,
html.iveri-dark-mode .swagger-ui .info .description strong,
html.iveri-dark-mode .swagger-ui .markdown,
html.iveri-dark-mode .swagger-ui .markdown p,
html.iveri-dark-mode .swagger-ui .markdown li,
html.iveri-dark-mode .swagger-ui .markdown strong {
    color: #e2e8f0 !important;
}

html.iveri-dark-mode .swagger-ui .info .title small {
    border-color: #334155 !important;
    background: #0f172a !important;
    color: #94a3b8 !important;
}

html.iveri-dark-mode .swagger-ui .markdown code,
html.iveri-dark-mode .swagger-ui .renderedMarkdown code {
    border-color: #334155 !important;
    background: #0b1220 !important;
    color: #e2e8f0 !important;
}

html.iveri-dark-mode .swagger-ui .scheme-container {
    background: transparent !important;
    box-shadow: none !important;
}

html.iveri-dark-mode .swagger-ui .btn.authorize {
    border-color: #e2e8f0 !important;
    background: #e2e8f0 !important;
    color: #0b1220 !important;
}

html.iveri-dark-mode .swagger-ui .btn.authorize svg {
    fill: #059669 !important;
}

html.iveri-dark-mode .swagger-ui .btn.authorize:hover {
    background: #ffffff !important;
    border-color: #ffffff !important;
    color: #0b1220 !important;
}

html.iveri-dark-mode .swagger-ui .authorization__btn svg {
    fill: #94a3b8 !important;
}

html.iveri-dark-mode .swagger-ui .opblock-tag {
    border-color: #1e293b !important;
    background: #111827 !important;
    color: #f8fafc !important;
}

html.iveri-dark-mode .swagger-ui .opblock-tag:hover {
    border-color: #334155 !important;
    background: #0f172a !important;
}

html.iveri-dark-mode .swagger-ui .opblock-tag a,
html.iveri-dark-mode .swagger-ui .opblock-tag small {
    color: #cbd5e1 !important;
}

html.iveri-dark-mode .swagger-ui .opblock {
    border-color: #1e293b !important;
    background: #111827 !important;
}

html.iveri-dark-mode .swagger-ui .opblock.opblock-get,
html.iveri-dark-mode .swagger-ui .opblock.opblock-post,
html.iveri-dark-mode .swagger-ui .opblock.opblock-put,
html.iveri-dark-mode .swagger-ui .opblock.opblock-patch,
html.iveri-dark-mode .swagger-ui .opblock.opblock-delete,
html.iveri-dark-mode .swagger-ui .opblock.opblock-head,
html.iveri-dark-mode .swagger-ui .opblock.opblock-options {
    border-color: #1e293b !important;
    background: #111827 !important;
}

html.iveri-dark-mode .swagger-ui .opblock .opblock-summary,
html.iveri-dark-mode .swagger-ui .opblock-body,
html.iveri-dark-mode .swagger-ui .opblock.opblock-get .opblock-summary,
html.iveri-dark-mode .swagger-ui .opblock.opblock-post .opblock-summary,
html.iveri-dark-mode .swagger-ui .opblock.opblock-put .opblock-summary,
html.iveri-dark-mode .swagger-ui .opblock.opblock-patch .opblock-summary,
html.iveri-dark-mode .swagger-ui .opblock.opblock-delete .opblock-summary,
html.iveri-dark-mode .swagger-ui .opblock.opblock-head .opblock-summary,
html.iveri-dark-mode .swagger-ui .opblock.opblock-options .opblock-summary {
    background: #111827 !important;
}

html.iveri-dark-mode .swagger-ui .opblock-summary-path {
    color: #f8fafc !important;
}

html.iveri-dark-mode .swagger-ui .opblock-summary-description {
    color: #94a3b8 !important;
}

html.iveri-dark-mode .swagger-ui .opblock-section-header {
    border-color: #1e293b !important;
    background: #0f172a !important;
}

html.iveri-dark-mode .swagger-ui .opblock-section-header h4,
html.iveri-dark-mode .swagger-ui .opblock-section-header label,
html.iveri-dark-mode .swagger-ui .parameter__name,
html.iveri-dark-mode .swagger-ui .response-col_description,
html.iveri-dark-mode .swagger-ui .parameters-col_description,
html.iveri-dark-mode .swagger-ui .parameters-col_description p {
    color: #e2e8f0 !important;
}

html.iveri-dark-mode .swagger-ui .parameters thead tr th,
html.iveri-dark-mode .swagger-ui .parameters thead tr td,
html.iveri-dark-mode .swagger-ui .responses-table thead tr th,
html.iveri-dark-mode .swagger-ui .responses-table thead tr td {
    border-color: #1e293b !important;
    background: #0f172a !important;
    color: #94a3b8 !important;
}

html.iveri-dark-mode .swagger-ui .parameter__type,
html.iveri-dark-mode .swagger-ui .prop-type {
    color: #93c5fd !important;
}

html.iveri-dark-mode .swagger-ui .parameter__name.required {
    color: #fda4af !important;
}

html.iveri-dark-mode .swagger-ui .tab {
    border-color: #1e293b !important;
}

html.iveri-dark-mode .swagger-ui .tab li button.tablinks {
    color: #94a3b8 !important;
}

html.iveri-dark-mode .swagger-ui .tab li.active button.tablinks {
    color: #f8fafc !important;
}

html.iveri-dark-mode .swagger-ui .model-example {
    border-color: #1e293b !important;
    background: #0b1220 !important;
}

html.iveri-dark-mode .swagger-ui .microlight,
html.iveri-dark-mode .swagger-ui pre.microlight,
html.iveri-dark-mode .swagger-ui .model-example pre,
html.iveri-dark-mode .swagger-ui .highlight-code,
html.iveri-dark-mode .swagger-ui .response-col_description__inner pre {
    border-color: #1e293b !important;
    background: #0b1220 !important;
    color: #e2e8f0 !important;
}

html.iveri-dark-mode .swagger-ui .microlight *,
html.iveri-dark-mode .swagger-ui pre.microlight * {
    color: #e2e8f0 !important;
}

html.iveri-dark-mode .swagger-ui .iveri-copy-json,
html.iveri-dark-mode .swagger-ui .highlight-code .copy-to-clipboard,
html.iveri-dark-mode .swagger-ui .curl-command .copy-to-clipboard {
    border-color: #334155 !important;
    background: #111827 !important;
    color: #e2e8f0 !important;
}

html.iveri-dark-mode .swagger-ui .highlight-code .copy-to-clipboard::after,
html.iveri-dark-mode .swagger-ui .curl-command .copy-to-clipboard::after {
    color: #e2e8f0 !important;
}

html.iveri-dark-mode .swagger-ui .iveri-copy-json.is-copied {
    border-color: #34d399 !important;
    background: #064e3b !important;
    color: #a7f3d0 !important;
}

html.iveri-dark-mode .swagger-ui .dialog-ux .backdrop-ux {
    background: rgb(0 0 0 / 65%) !important;
}

html.iveri-dark-mode .swagger-ui .dialog-ux .modal-ux {
    border-color: #1e293b !important;
    background: #111827 !important;
    box-shadow: 0 24px 60px rgb(0 0 0 / 45%) !important;
}

html.iveri-dark-mode .swagger-ui .dialog-ux .modal-ux-header {
    border-color: #1e293b !important;
    background: #0f172a !important;
}

html.iveri-dark-mode .swagger-ui .dialog-ux .modal-ux-header h3,
html.iveri-dark-mode .swagger-ui .dialog-ux .modal-ux-close {
    color: #f8fafc !important;
}

html.iveri-dark-mode .swagger-ui .dialog-ux .modal-ux-content {
    background: #111827 !important;
}

html.iveri-dark-mode .swagger-ui .auth-container {
    border-color: #1e293b !important;
    background: #0b1220 !important;
}

html.iveri-dark-mode .swagger-ui .auth-container h4,
html.iveri-dark-mode .swagger-ui .auth-container label {
    color: #f8fafc !important;
}

html.iveri-dark-mode .swagger-ui .auth-container p {
    color: #94a3b8 !important;
}

html.iveri-dark-mode .swagger-ui .auth-container input,
html.iveri-dark-mode .swagger-ui input,
html.iveri-dark-mode .swagger-ui select,
html.iveri-dark-mode .swagger-ui textarea,
html.iveri-dark-mode .swagger-ui .body-param__text {
    border-color: #334155 !important;
    background: #0b1220 !important;
    color: #f8fafc !important;
}

html.iveri-dark-mode .swagger-ui .auth-btn-wrapper .btn.authorize {
    background: #e2e8f0 !important;
    border-color: #e2e8f0 !important;
    color: #0b1220 !important;
}

html.iveri-dark-mode .swagger-ui .auth-btn-wrapper .btn.modal-btn {
    background: transparent !important;
    border-color: #334155 !important;
    color: #e2e8f0 !important;
}

html.iveri-dark-mode .swagger-ui section.models {
    border-color: #1e293b !important;
    background: #111827 !important;
}

html.iveri-dark-mode .swagger-ui section.models h4,
html.iveri-dark-mode .swagger-ui .models-control {
    color: #f8fafc !important;
}

`;

export const SWAGGER_UI_CUSTOM_JS = [
    '(() => {',
    '    const THEME_KEY = "iveri-swagger-theme";',
    '',
    '    const addCopyButtons = () => {',
    "        document.querySelectorAll('.swagger-ui .model-example').forEach((example) => {",
    "            if (example.querySelector('.iveri-copy-json')) return;",
    "            const source = example.querySelector('.model-box, pre, code');",
    '            if (!source) return;',
    '',
    "            const button = document.createElement('button');",
    "            button.className = 'iveri-copy-json';",
    "            button.type = 'button';",
    "            button.textContent = 'Copy JSON';",
    "            button.addEventListener('click', async () => {",
    '                try {',
    "                    await navigator.clipboard.writeText(source.innerText ?? source.textContent ?? '');",
    "                    button.classList.add('is-copied');",
    "                    button.textContent = 'Copied';",
    '                    window.setTimeout(() => {',
    "                        button.classList.remove('is-copied');",
    "                        button.textContent = 'Copy JSON';",
    '                    }, 1400);',
    '                } catch {',
    "                    button.textContent = 'Copy failed';",
    '                }',
    '            });',
    '',
    '            example.appendChild(button);',
    '        });',
    '    };',
    '',
    '    const resolveInitialDark = () => {',
    '        const saved = localStorage.getItem(THEME_KEY);',
    "        if (saved === 'dark') return true;",
    "        if (saved === 'light') return false;",
    "        return window.matchMedia('(prefers-color-scheme: dark)').matches;",
    '    };',
    '',
    '    const addThemeToggle = () => {',
    "        const topbar = document.querySelector('.swagger-ui .topbar .wrapper') ?? document.querySelector('.swagger-ui .topbar');",
    "        if (!topbar || topbar.querySelector('.iveri-theme-toggle')) return;",
    '',
    "        const button = document.createElement('button');",
    "        button.className = 'iveri-theme-toggle';",
    "        button.type = 'button';",
    '        const setTheme = (dark) => {',
    "            document.documentElement.classList.toggle('iveri-dark-mode', dark);",
    '            localStorage.setItem(THEME_KEY, dark ? "dark" : "light");',
    "            button.textContent = dark ? 'Light' : 'Dark';",
    "            button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');",
    '        };',
    '        setTheme(resolveInitialDark());',
    "        button.addEventListener('click', () => {",
    "            setTheme(!document.documentElement.classList.contains('iveri-dark-mode'));",
    '        });',
    '        topbar.appendChild(button);',
    '    };',
    '',
    '    const mountControls = () => {',
    '        addCopyButtons();',
    '        addThemeToggle();',
    "        if (!document.querySelector('.iveri-theme-toggle')) window.setTimeout(mountControls, 100);",
    '    };',
    '',
    '    mountControls();',
    '    new MutationObserver(() => {',
    '        addCopyButtons();',
    '        addThemeToggle();',
    '    }).observe(document.body, { childList: true, subtree: true });',
    '})();',
].join('\n');
