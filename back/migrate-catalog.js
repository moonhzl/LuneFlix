const { runCatalog } = require("./services/catalogService");

runCatalog({ action: "migrate_legacy" })
    .then(result => {
        console.log(`Migração concluída: ${result.migrated} migrados, ${result.skipped} ignorados sem IMDb ID.`);
    })
    .catch(error => {
        console.error(`Falha na migração: ${error.message}`);
        process.exitCode = 1;
    });