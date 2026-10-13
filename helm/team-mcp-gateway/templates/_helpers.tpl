{{/*
_helpers.tpl - small reusable pieces for the templates.
*/}}

{{/* Full image name for our own images. Usage: include "tmg.image" (list . "gateway") */}}
{{- define "tmg.image" -}}
{{- $root := index . 0 -}}
{{- $name := index . 1 -}}
{{ $root.Values.images.registry }}/{{ $name }}:{{ $root.Values.images.tag }}
{{- end -}}

{{/* Safe container settings: no root, no extra powers, read-only files. */}}
{{- define "tmg.containerSecurity" -}}
securityContext:
  runAsNonRoot: true
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop: ["ALL"]
{{- end -}}

{{/* Storage class line for a PVC (only if one is set). */}}
{{- define "tmg.storageClass" -}}
{{- if .Values.storageClass }}
storageClassName: {{ .Values.storageClass }}
{{- end }}
{{- end -}}

{{/* The store URL (http or https). */}}
{{- define "tmg.storeUrl" -}}
{{ if .Values.ingress.tls }}https{{ else }}http{{ end }}://{{ .Values.ingress.storeHost }}
{{- end -}}

{{/*
Database settings for WordPress. Used by the WordPress pod AND the setup Job,
because WP-CLI reads the same wp-config.php, which reads these env vars.
*/}}
{{- define "tmg.wordpressEnv" -}}
- name: WORDPRESS_DB_HOST
  value: mariadb
- name: WORDPRESS_DB_NAME
  value: wordpress
- name: WORDPRESS_DB_USER
  value: wordpress
- name: WORDPRESS_DB_PASSWORD
  valueFrom: { secretKeyRef: { name: app-secrets, key: WP_DB_PASSWORD } }
{{- end -}}
