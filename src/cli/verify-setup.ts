#!/usr/bin/env node
import { verifyJungleGridSetup } from "@/src/services/junglegrid-setup-verification";

verifyJungleGridSetup()
  .then((result) => {
    console.log("Jungle Grid credentials and workload lifecycle verified.");
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
