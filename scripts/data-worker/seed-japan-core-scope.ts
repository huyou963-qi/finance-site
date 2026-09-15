/** Deployment convergence step: physically retire the approved 79 Japan details. */
import {
  disconnectJapanCoreScopeDatabase,
  runDropJapanDetails,
} from "./drop-japan-details";

runDropJapanDetails(true)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => disconnectJapanCoreScopeDatabase());
