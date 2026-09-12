/**
 * ============================================================
 * HYPENOSYS SHARDING MIGRATION MODULE
 * Migración atómica de persistencia monolítica a sharding por organización.
 * ============================================================
 */

(function () {
  'use strict';

  /**
   * Ejecuta la migración sharding para todas las organizaciones registradas.
   * @param {Function} [onProgress] Callback para reportar mensajes de progreso en tiempo real.
   * @returns {Promise<Object>} Resumen completo de la migración { success, orgs: {}, summary: { total, succeeded, failed } }.
   */
  async function runShardingMigration(onProgress) {
    const log = (msg) => {
      console.log(`[SHARDING-MIGRATION] ${msg}`);
      if (typeof onProgress === 'function') {
        try {
          onProgress(msg);
        } catch (e) {
          console.warn('[SHARDING-MIGRATION] Error in onProgress callback:', e);
        }
      }
    };

    log('Iniciando proceso de migración por sharding...');

    const report = {
      success: true,
      orgs: {},
      summary: {
        total: 0,
        succeeded: 0,
        failed: 0
      }
    };

    try {
      // a. Leer fuentes monolíticas originales con forceRemote: true
      log('Cargando datos origen (organizations.json, dashboard_tasks.json, dashboard_tasks_archive.json)...');
      const [orgsRes, tasksRes, archiveRes] = await Promise.all([
        window.githubApi.fetchFileWithSha('_data/organizations.json', 'json', true),
        window.githubApi.fetchFileWithSha('_data/dashboard_tasks.json', 'json', true),
        window.githubApi.fetchFileWithSha('_data/dashboard_tasks_archive.json', 'json', true)
      ]);

      const orgsData = orgsRes.content || {};
      const organizations = orgsData.organizations || [];
      const allTasks = (tasksRes.content && tasksRes.content.tasks) || [];
      const allArchive = (archiveRes.content && archiveRes.content.tasks) || [];

      // b. Saneamiento: Tareas sin organizationId se asignan a 'hypenosys'
      let sanitizedTasksCount = 0;
      allTasks.forEach(t => {
        if (!t.organizationId) {
          t.organizationId = 'hypenosys';
          sanitizedTasksCount++;
        }
      });
      allArchive.forEach(t => {
        if (!t.organizationId) {
          t.organizationId = 'hypenosys';
          sanitizedTasksCount++;
        }
      });

      if (sanitizedTasksCount > 0) {
        log(`Saneamiento de datos: ${sanitizedTasksCount} tareas sin organizationId asignadas a "hypenosys".`);
      }

      report.summary.total = organizations.length;
      log(`Organizaciones a procesar: ${organizations.length}`);

      for (const org of organizations) {
        const orgId = org.id;
        log(`\n--- Procesando Organización: ${org.name} (${orgId}) ---`);

        report.orgs[orgId] = {
          id: orgId,
          name: org.name,
          success: false,
          error: null,
          counts: {
            expected: { members: 0, tasks: 0, archive: 0 },
            verified: { members: 0, tasks: 0, archive: 0 }
          }
        };

        try {
          // Filtrar tareas esperadas
          const orgTasks = allTasks.filter(t => t.organizationId === orgId);
          const orgArchive = allArchive.filter(t => t.organizationId === orgId);

          // Obtener miembros (desde org.members o leyendo meta.json existente si es re-ejecución)
          let rawMembers = org.members;
          if (!rawMembers) {
            try {
              const existingMeta = await window.githubApi.fetchFileWithSha(`_data/orgs/${orgId}/meta.json`, 'json', true);
              if (existingMeta.content && Array.isArray(existingMeta.content.members)) {
                rawMembers = existingMeta.content.members;
              }
            } catch (e) {
              console.warn(`[SHARDING-MIGRATION] Could not read existing meta for ${orgId}:`, e);
            }
          }
          if (!rawMembers) rawMembers = [];

          // Transformación de miembros a { handle, teams: [], roles: [] }
          const formattedMembers = rawMembers.map(m => {
            if (typeof m === 'string') {
              return { handle: m, teams: [], roles: [] };
            }
            return {
              handle: m.handle || m.username || String(m),
              teams: Array.isArray(m.teams) ? m.teams : [],
              roles: Array.isArray(m.roles) ? m.roles : []
            };
          });

          report.orgs[orgId].counts.expected = {
            members: formattedMembers.length,
            tasks: orgTasks.length,
            archive: orgArchive.length
          };

          log(`Conteos esperados para ${orgId} -> Miembros: ${formattedMembers.length}, Tareas activas: ${orgTasks.length}, Archivadas: ${orgArchive.length}`);

          // c. Escritura secuencial: meta.json -> tasks.json -> tasks_archive.json
          const metaPath = `_data/orgs/${orgId}/meta.json`;
          const tasksPath = `_data/orgs/${orgId}/tasks.json`;
          const archivePath = `_data/orgs/${orgId}/tasks_archive.json`;

          const metaPayload = {
            id: org.id,
            name: org.name,
            createdBy: org.createdBy || 'Sistema',
            createdAt: org.createdAt || new Date().toISOString(),
            isDefault: !!org.isDefault,
            members: formattedMembers,
            schema_version: '1.0.0'
          };

          const tasksPayload = {
            schema_version: '1.2.0',
            last_updated: new Date().toISOString(),
            organizationId: orgId,
            tasks: orgTasks
          };

          const archivePayload = {
            schema_version: '1.2.0',
            last_updated: new Date().toISOString(),
            organizationId: orgId,
            tasks: orgArchive
          };

          log(`Escribiendo ${metaPath}...`);
          await window.githubApi.atomicWrite(
            metaPath,
            () => metaPayload,
            `chore(sharding): migrar meta.json para org ${orgId}`,
            { forceRemote: true, createIfMissing: true, audit: false }
          );

          log(`Escribiendo ${tasksPath}...`);
          await window.githubApi.atomicWrite(
            tasksPath,
            () => tasksPayload,
            `chore(sharding): migrar tasks.json para org ${orgId}`,
            { forceRemote: true, createIfMissing: true, audit: true }
          );

          log(`Escribiendo ${archivePath}...`);
          await window.githubApi.atomicWrite(
            archivePath,
            () => archivePayload,
            `chore(sharding): migrar tasks_archive.json para org ${orgId}`,
            { forceRemote: true, createIfMissing: true, audit: true }
          );

          // d. Lectura de verificación (read back)
          log(`Verificando datos escritos para ${orgId}...`);
          const [readMetaRes, readTasksRes, readArchiveRes] = await Promise.all([
            window.githubApi.fetchFileWithSha(metaPath, 'json', true),
            window.githubApi.fetchFileWithSha(tasksPath, 'json', true),
            window.githubApi.fetchFileWithSha(archivePath, 'json', true)
          ]);

          const verifiedMembersCount = (readMetaRes.content && Array.isArray(readMetaRes.content.members)) ? readMetaRes.content.members.length : -1;
          const verifiedTasksCount = (readTasksRes.content && Array.isArray(readTasksRes.content.tasks)) ? readTasksRes.content.tasks.length : -1;
          const verifiedArchiveCount = (readArchiveRes.content && Array.isArray(readArchiveRes.content.tasks)) ? readArchiveRes.content.tasks.length : -1;

          report.orgs[orgId].counts.verified = {
            members: verifiedMembersCount,
            tasks: verifiedTasksCount,
            archive: verifiedArchiveCount
          };

          const isVerified = (
            verifiedMembersCount === formattedMembers.length &&
            verifiedTasksCount === orgTasks.length &&
            verifiedArchiveCount === orgArchive.length
          );

          if (!isVerified) {
            throw new Error(`Verificación fallida para ${orgId}. Conteos no coinciden. Esperados: ${JSON.stringify(report.orgs[orgId].counts.expected)}, Obtenidos: ${JSON.stringify(report.orgs[orgId].counts.verified)}`);
          }

          log(`Verificación exitosa para ${orgId} ✓`);

          // e. Actualización ligera individual en organizations.json
          log(`Actualizando entrada shardeada de ${orgId} en organizations.json...`);
          await window.githubApi.atomicWrite(
            '_data/organizations.json',
            (currentOrgsData) => {
              if (!currentOrgsData || !Array.isArray(currentOrgsData.organizations)) {
                return currentOrgsData;
              }
              const orgIndex = currentOrgsData.organizations.findIndex(o => o.id === orgId);
              if (orgIndex !== -1) {
                const existing = currentOrgsData.organizations[orgIndex];
                currentOrgsData.organizations[orgIndex] = {
                  id: existing.id,
                  name: existing.name,
                  createdBy: existing.createdBy || 'Sistema',
                  createdAt: existing.createdAt || new Date().toISOString(),
                  isDefault: !!existing.isDefault,
                  isSharded: true
                };
              }
              return currentOrgsData;
            },
            `chore(sharding): marcar org ${orgId} como isSharded: true`,
            { forceRemote: true, audit: true }
          );

          report.orgs[orgId].success = true;
          report.summary.succeeded++;
          log(`Organización ${orgId} migrada correctamente ✓`);

        } catch (orgErr) {
          // f. Registrar fallo y continuar con la siguiente organización
          report.orgs[orgId].success = false;
          report.orgs[orgId].error = orgErr.message;
          report.summary.failed++;
          report.success = false;
          log(`❌ ERROR migrando organización ${orgId}: ${orgErr.message}`);
        }
      }

      log(`\n============================================================`);
      log(`RESUMEN MIGRACIÓN SHARDING:`);
      log(`Total: ${report.summary.total} | Exitosas: ${report.summary.succeeded} | Fallidas: ${report.summary.failed}`);
      log(`============================================================`);

      return report;
    } catch (err) {
      log(`❌ CRITICAL MIGRATION FAILURE: ${err.message}`);
      report.success = false;
      report.globalError = err.message;
      return report;
    }
  }

  // Exponer globalmente
  window.runShardingMigration = runShardingMigration;
})();
