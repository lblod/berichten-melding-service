import {
  sparqlEscapeUri,
} from 'mu';
import { updateSudo as update } from '@lblod/mu-auth-sudo';
import * as env from '../env';

export async function updateStatus(subject, newStatus) {
  const queryStr = `
   ${env.PREFIXES}
   DELETE {
    GRAPH ?g {
      ?subject adms:status ?status.
    }
   }
   INSERT {
    GRAPH ?g {
      ?subject adms:status ${sparqlEscapeUri(newStatus)}.
    }
   }
   WHERE {
     VALUES ?subject {
       ${sparqlEscapeUri(subject)}
     }
    GRAPH ?g {
      ?subject adms:status ?status.
    }
   }
  `;
  await update(queryStr);
}
