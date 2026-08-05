/**
 * Shared Swagger UI presentation for every Iveri API.
 *
 * The OpenAPI document belongs to each service, but the operator experience should not change
 * from one API to the next. Keep the UI defaults here so a new service cannot accidentally
 * reopen every operation or inherit a dark browser theme.
 */
export const SWAGGER_UI_OPTIONS = {
    persistAuthorization: true,
    docExpansion: 'none',
    tagsSorter: 'alpha',
    operationsSorter: 'alpha',
    defaultModelsExpandDepth: -1,
} as const;

export const SWAGGER_UI_CUSTOM_CSS = `
html,
body,
.swagger-ui {
    background: #ffffff !important;
    color: #0f172a !important;
}

.swagger-ui {
    max-width: 1440px;
    margin: 0 auto;
    padding: 0 24px 48px;
    font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 15px;
}

.swagger-ui .wrapper {
    max-width: 1440px;
}

.swagger-ui .topbar {
    min-height: 64px;
    margin: 0 -24px;
    padding: 0 24px;
    background: linear-gradient(115deg, #0b1220 0%, #172554 62%, #1d4ed8 100%) !important;
}

.swagger-ui .topbar .wrapper {
    padding: 0;
}

.swagger-ui .topbar .link {
    display: flex;
    align-items: center;
    min-height: 64px;
    font-weight: 700;
    letter-spacing: 0.01em;
}

.swagger-ui .topbar {
    background: #0f172a !important;
    border-bottom: 1px solid #0f172a !important;
    box-shadow: 0 2px 8px rgb(15 23 42 / 12%);
}

.swagger-ui .topbar a,
.swagger-ui .topbar .link {
    color: #ffffff !important;
}

.swagger-ui .scheme-container,
.swagger-ui section.models,
.swagger-ui .opblock-tag,
.swagger-ui .model-box,
.swagger-ui .opblock-description-wrapper,
.swagger-ui .opblock-external-docs-wrapper,
.swagger-ui .responses-inner,
.swagger-ui .response-col_description__inner,
.swagger-ui .parameter__extension {
    background: #ffffff !important;
}

.swagger-ui .info {
    margin: 36px 0 32px;
    padding: 30px 34px;
    background: linear-gradient(135deg, #ffffff 0%, #f8fbff 100%) !important;
    border: 1px solid #dbe4f0;
    border-radius: 18px;
    box-shadow: 0 12px 30px rgb(15 23 42 / 8%);
}

.swagger-ui .info .title {
    margin: 0 0 14px;
    color: #0b1220 !important;
    font-size: 34px !important;
    font-weight: 800 !important;
    letter-spacing: -0.035em;
}

.swagger-ui .info .title small {
    display: inline-flex;
    align-items: center;
    margin-left: 10px;
    padding: 5px 10px;
    background: #dbeafe !important;
    border-radius: 999px;
    color: #1d4ed8 !important;
    font-size: 12px !important;
    font-weight: 800;
    letter-spacing: 0.04em;
    vertical-align: middle;
}

.swagger-ui .info .description {
    max-width: 960px;
    font-size: 15px;
    line-height: 1.7;
}

.swagger-ui .info a,
.swagger-ui .markdown a,
.swagger-ui .renderedMarkdown a {
    color: #1d4ed8 !important;
    font-weight: 650;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
}

.swagger-ui .info .title,
.swagger-ui .info .title small,
.swagger-ui .info .description,
.swagger-ui .info .description p,
.swagger-ui .info .description li,
.swagger-ui .markdown,
.swagger-ui .markdown p,
.swagger-ui .markdown li,
.swagger-ui .renderedMarkdown,
.swagger-ui .renderedMarkdown p,
.swagger-ui .renderedMarkdown li,
.swagger-ui .renderedMarkdown strong,
.swagger-ui .renderedMarkdown em {
    color: #0f172a !important;
}

.swagger-ui .info .title,
.swagger-ui .opblock-tag,
.swagger-ui .opblock-tag small,
.swagger-ui .model-title,
.swagger-ui .model,
.swagger-ui .parameter__name,
.swagger-ui .response-col_status,
.swagger-ui .response-col_description,
.swagger-ui label,
.swagger-ui section.models h4 {
    color: #0f172a !important;
}

.swagger-ui .scheme-container,
.swagger-ui section.models,
.swagger-ui .opblock-tag,
.swagger-ui .opblock,
.swagger-ui .model-box,
.swagger-ui table thead tr th,
.swagger-ui table thead tr td {
    border-color: #cbd5e1 !important;
    box-shadow: none !important;
}

.swagger-ui .opblock-tag:hover {
    background: #f8fafc !important;
}

.swagger-ui .opblock-tag-section {
    margin: 0 0 16px;
}

.swagger-ui .opblock-tag {
    display: flex;
    align-items: center;
    min-height: 54px;
    margin: 0 !important;
    padding: 14px 18px !important;
    font-size: 20px !important;
    font-weight: 700 !important;
    border: 1px solid #dbe4f0 !important;
    border-radius: 12px;
    box-shadow: 0 4px 14px rgb(15 23 42 / 5%) !important;
    transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.swagger-ui .opblock-tag:hover {
    border-color: #93c5fd !important;
    box-shadow: 0 8px 18px rgb(37 99 235 / 10%) !important;
    transform: translateY(-1px);
}

.swagger-ui .opblock-tag small {
    margin-left: 10px;
    color: #475569 !important;
    font-size: 13px !important;
    font-weight: 600;
}

.swagger-ui .opblock-summary-description,
.swagger-ui .opblock-summary-path,
.swagger-ui .opblock-summary-path__deprecated,
.swagger-ui .parameter__name,
.swagger-ui .parameter__type,
.swagger-ui .response-col_status,
.swagger-ui .response-col_description,
.swagger-ui .response-col_description__inner p,
.swagger-ui .prop-format,
.swagger-ui .model,
.swagger-ui .model-title,
.swagger-ui .model-toggle,
.swagger-ui .property.primitive,
.swagger-ui .property-row,
.swagger-ui .tab li,
.swagger-ui .tab li button.tablinks {
    color: #0f172a !important;
}

.swagger-ui .opblock-summary-description,
.swagger-ui .parameter__type,
.swagger-ui .prop-format {
    color: #475569 !important;
}

.swagger-ui code,
.swagger-ui pre,
.swagger-ui .microlight,
.swagger-ui .markdown code,
.swagger-ui .renderedMarkdown code {
    background: #f1f5f9 !important;
    color: #0f172a !important;
    border: 1px solid #cbd5e1 !important;
    border-radius: 4px;
    text-shadow: none !important;
}

.swagger-ui pre {
    padding: 14px !important;
    overflow-x: auto;
}

.swagger-ui .opblock-summary {
    min-height: 54px;
    border-color: #dbe4f0 !important;
    border-radius: 10px;
    background: #f8fafc !important;
}

.swagger-ui .opblock {
    margin: 10px 0;
    border-radius: 12px !important;
    box-shadow: 0 4px 14px rgb(15 23 42 / 5%) !important;
    overflow: hidden;
}

.swagger-ui .opblock-summary-method {
    color: #ffffff !important;
    font-weight: 700 !important;
}

.swagger-ui .opblock-summary-control:focus {
    outline: 2px solid #2563eb !important;
    outline-offset: 2px;
}

.swagger-ui input,
.swagger-ui select,
.swagger-ui textarea {
    background: #ffffff !important;
    color: #0f172a !important;
    border: 1px solid #94a3b8 !important;
    border-radius: 8px;
    box-shadow: 0 1px 2px rgb(15 23 42 / 4%);
}

.swagger-ui .btn {
    color: #0f172a !important;
    background: #ffffff !important;
    border: 1px solid #475569 !important;
    border-radius: 8px;
    font-weight: 650;
    transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
    box-shadow: none !important;
}

.swagger-ui .btn:hover {
    border-color: #2563eb !important;
    transform: translateY(-1px);
}

.swagger-ui .btn.authorize {
    color: #ffffff !important;
    background: #0f172a !important;
    border-color: #0f172a !important;
}

.swagger-ui .btn.execute {
    color: #ffffff !important;
    background: #1d4ed8 !important;
    border-color: #1d4ed8 !important;
}

.swagger-ui section.models {
    margin-top: 28px;
    padding: 0 18px 8px;
    border: 1px solid #dbe4f0 !important;
    border-radius: 14px;
    box-shadow: 0 4px 14px rgb(15 23 42 / 5%) !important;
}

.swagger-ui section.models h4 {
    padding: 18px 0;
    font-size: 18px;
    font-weight: 750;
}

.swagger-ui .models-control {
    color: #0f172a !important;
}

.swagger-ui .opblock-description-wrapper p,
.swagger-ui .opblock-external-docs-wrapper p,
.swagger-ui .response-col_description__inner p,
.swagger-ui .parameter__type,
.swagger-ui .prop-format {
    color: #475569 !important;
}
`;
