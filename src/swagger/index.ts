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
    color: #111827 !important;
}

.swagger-ui .topbar,
.swagger-ui .scheme-container,
.swagger-ui section.models,
.swagger-ui .opblock-tag,
.swagger-ui .model-box {
    background: #ffffff !important;
}

.swagger-ui .topbar {
    border-bottom: 1px solid #e5e7eb;
}

.swagger-ui .topbar a,
.swagger-ui .info .title,
.swagger-ui .opblock-tag,
.swagger-ui .opblock-tag small,
.swagger-ui .model-title,
.swagger-ui .model,
.swagger-ui .parameter__name,
.swagger-ui .response-col_status,
.swagger-ui .response-col_description,
.swagger-ui .markdown p,
.swagger-ui .markdown li,
.swagger-ui label,
.swagger-ui section.models h4 {
    color: #111827 !important;
}

.swagger-ui .scheme-container,
.swagger-ui section.models,
.swagger-ui .opblock-tag {
    border-color: #e5e7eb !important;
    box-shadow: none !important;
}

.swagger-ui .opblock-tag:hover {
    background: #f9fafb !important;
}

.swagger-ui input,
.swagger-ui select,
.swagger-ui textarea {
    background: #ffffff !important;
    color: #111827 !important;
    border-color: #d1d5db !important;
}

.swagger-ui .btn {
    color: #111827 !important;
    border-color: #9ca3af !important;
}

.swagger-ui .opblock-description-wrapper p,
.swagger-ui .opblock-external-docs-wrapper p,
.swagger-ui .response-col_description__inner p,
.swagger-ui .parameter__type,
.swagger-ui .prop-format {
    color: #4b5563 !important;
}
`;
