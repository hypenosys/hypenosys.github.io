# HAIS-001 — Primer piloto de producción Hypenosys

**Estado:** bootstrap verificable, **no** implementación completa ni producción aprobada.

Este directorio contiene el contrato inicial del piloto HAIS: 24 tareas con IDs, dependencias y criterios de aceptación. El objetivo principal es verificar la cadena **Hypenosys → Jules/Cognito → GitHub → CI → staging → informe**, antes de activar ejecución financiera real.

## Verificación

```bash
python3 pilot/hais-001/validate.py
```

El validador rechaza IDs repetidos, dependencias inexistentes, ciclos, tareas sin criterios, ejecutores desconocidos y cualquier configuración distinta de `PAPER` con `live_trading_enabled=false`. GitHub Actions ejecuta la misma comprobación al modificar este piloto.

## Planificador de importación offline

El adaptador `plan_import.py` transforma el manifiesto al esquema de tareas visto en `_data/orgs/hypenosys/tasks.json`, sin escribir nada en GitHub:

```bash
python3 pilot/hais-001/plan_import.py --output /tmp/hais-tasks-candidate.json
python3 pilot/hais-001/plan_import.py --existing /tmp/hais-tasks-candidate.json --output /tmp/hais-tasks-again.json
python3 -m unittest discover -s pilot/hais-001 -p 'test_*.py' -v
```

La segunda importación debe añadir cero tareas. El planificador rechaza workspaces que no sean `hais`, conserva tareas preexistentes y asigna identificadores estables. **No subir directamente el JSON generado**: primero verificar permisos, modelo de tareas y mecanismo de escritura autorizada. `blocked_by` está representado pero el scheduler actual todavía no ha demostrado que lo respete.

## Orden de activación

1. Haopeng crea personalmente su cuenta GitHub y habilita MFA. Un propietario existente verifica y concede únicamente los permisos necesarios.
2. Crear el workspace HAIS en Hypenosys y el repositorio privado `hypenosys/hais`, verificando primero la implementación real de organizaciones y permisos.
3. Conectar Jules y las APIs BYOK con **almacenamiento server-side** y cuotas. No usar `localStorage` para secretos de producción.
4. Ejecutar una tarea inocua para verificar el ciclo de sesión, cambios, PR, CI y sincronización.
5. Habilitar dos tareas de código independientes en paralelo solo tras demostrar bloqueo por dependencias y aislamiento de ramas.
6. Probar Cognito en sandbox separado; no conceder permisos de producción.
7. Construir el vertical slice de HAIS en PAPER, desplegar staging, restaurar backup, realizar rollback y solo entonces autorizar el piloto web limitado.

## Hallazgos y advertencias

El README actual de la suite describe almacenamiento local en el navegador de credenciales de GitHub, Jules y proveedores IA; **no equivale a un vault seguro multiusuario**. El código `assets/javascript/github-api.js` contiene fallback de autorización basado en logins y lectura dual de tareas con posible fallback legacy. Ambos requieren pruebas de aislamiento/autorización del lado servidor antes de invitar a un usuario nuevo o conectar claves con cargos reales.

No se garantiza que los sistemas existentes implementen un scheduler de dependencias, el aislamiento BYOK ni la autorización multi-tenant: son objetivos del backlog, **no capacidades demostradas**.

Este manifiesto aún no está conectado a un importador de tareas de Hypenosys. Hasta validar el esquema y la API reales, no se debe escribir directamente en `_data/orgs/*/tasks.json` ni simular que hay tareas asignadas.

## Límites

- Presupuesto objetivo 100 EUR, techo 150 EUR: requiere autorización humana antes de cualquier contratación.
- Sin trading LIVE, ni vinculación de broker con privilegios de órdenes.
- Sin crear cuentas por terceros, sin administrar claves en Git, sin despliegue automático.
- Toda tarea requiere evidencia verificable y PR revisada antes de marcarse DONE.

## Próximos pasos

Implementar importación idempotente del manifiesto una vez validado el contrato de tareas de Hypenosys, más aislamiento de secretos y políticas de autorización del backend. Mantener esta PR limitada a bootstrap, no mezclar refactorización masiva de la suite con la preparación del piloto.
