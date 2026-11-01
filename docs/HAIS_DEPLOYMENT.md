# HAIS — acceso desde dominios Hypenosys

## URLs de destino

- Desarrollo: https://dev.hypenosys.com/hais/
- Dashboard de desarrollo: https://dev.hypenosys.com/dashboard.html
- Página de desarrollo: https://dev.hypenosys.com/
- Producción (solo tras publicar explícitamente): https://hypenosys.com/hais/

## Cómo se genera la ruta

La página fuente `pages/hais-prototype.html` tiene front matter Jekyll con `permalink: /hais/`, por lo que la compilación genera la ruta `/hais/index.html`. Las páginas `index.html` y `dashboard.html` enlazan al destino mediante `{{ '/hais/' | relative_url }}`. El prototipo funciona de forma aislada: datos ficticios almacenados en localStorage.

## Publicación de develop

El repositorio contiene un archivo `CNAME` que señala `hypenosys.com`, **no** `dev.hypenosys.com`. Fusionar en `develop` no constituye prueba de publicación del subdominio. La configuración de dominio y despliegue corresponde al proveedor/CDN y al workflow/servicio que publica la rama.

Para que el entorno dev funcione, comprobar:

1. Resolver DNS de `dev.hypenosys.com` y verificar HTTPS.
2. Confirmar que el hosting asociado a `dev.hypenosys.com` compila y sirve la rama `develop` (por ejemplo, pipeline independiente o proxy, sin cambiar el `CNAME` de producción).
3. Confirmar que la publicación sirve archivos de Jekyll, incluyendo `/hais/index.html`, no solo los archivos fuente.
4. Comprobar manualmente con el navegador `/hais/`, `/dashboard.html` y `/`; seguir el enlace «Abrir HAIS».
5. En `/hais/`, navegar por 12 módulos, ejecutar demo de agente, crear tarea y comprobar persistencia tras recargar; reiniciar datos con «Reiniciar demo».
6. Ejecutar `bundle exec jekyll build` y las pruebas Playwright existentes antes de anunciar despliegue validado.

### Comandos de comprobación

```bash
dig +short dev.hypenosys.com
curl -IL --fail https://dev.hypenosys.com/hais/
curl -IL --fail https://dev.hypenosys.com/dashboard.html
bundle exec jekyll build
test -f _site/hais/index.html
```

**No cambiar el `CNAME` de producción a `dev.hypenosys.com`**: eso podría romper `hypenosys.com`. Para dos dominios con ramas diferentes se necesita configuración de hosting separada o un proxy/CDN correctamente configurado.

## Estado y límites

- Código de prototipo y enlaces de navegación: incluidos en `develop` tras aprobar el PR.
- Backend, conectores, autentificación y ejecución real de agentes: pendientes.
- DNS, SSL, pipeline y accesibilidad pública de `dev.hypenosys.com`: deben confirmarse externamente.
