import {
  uuid,
  sparqlEscapeUri,
} from 'mu';
import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';

import * as env from '../env';
import { parseResult } from '../support';

/**
 * We need to attach a cloned version of the authentication data because download URL service 
 *   will delete these after it reached final state, be it failed or success.
 * If we keep this info by reference, this operation might interfer with ongoing downloads using the
 * same credentials.
 */
export async function attachClonedAuthenticationConfiguraton(
  remoteDataObjectUri,
  jobUri
) {
  const getInfoQuery = `
    ${env.PREFIXES}
    SELECT DISTINCT ?graph ?secType ?authenticationConfiguration WHERE {
      GRAPH ?graph {
        ${sparqlEscapeUri(jobUri)}
          dgftSec:targetAuthenticationConfiguration
            ?authenticationConfiguration.
        ?authenticationConfiguration
          dgftSec:securityConfiguration/rdf:type ?secType .
      }
    }
  `;

  const authData = parseResult(await query(getInfoQuery))[0];
  const newAuthConf = `http://data.lblod.info/authentications/${uuid()}`;
  const newConf = `http://data.lblod.info/configurations/${uuid()}`;
  const newCreds = `http://data.lblod.info/credentials/${uuid()}`;

  let cloneQuery = '';

  if (!authData) {
    return undefined;
  } else if (authData.secType === env.BASIC_AUTH) {
    cloneQuery = `
      ${env.PREFIXES}
      INSERT {
        GRAPH ?g {
          ${sparqlEscapeUri(remoteDataObjectUri)}
            dgftSec:targetAuthenticationConfiguration
              ${sparqlEscapeUri(newAuthConf)} .
          ${sparqlEscapeUri(newAuthConf)}
            dgftSec:secrets ${sparqlEscapeUri(newCreds)} .
          ${sparqlEscapeUri(newCreds)} meb:username ?user ;
            muAccount:password ?pass .
          ${sparqlEscapeUri(newAuthConf)}
            dgftSec:securityConfiguration ${sparqlEscapeUri(newConf)} .
          ${sparqlEscapeUri(newConf)}
            ?srcConfP ?srcConfO .
        }
      }
      WHERE {
        GRAPH ?g {
          ${sparqlEscapeUri(authData.authenticationConfiguration)}
            dgftSec:securityConfiguration ?srcConfg.
          ?srcConfg ?srcConfP ?srcConfO.

          ${sparqlEscapeUri(authData.authenticationConfiguration)}
            dgftSec:secrets ?srcSecrets.
          ?srcSecrets  meb:username ?user ;
            muAccount:password ?pass .
        }
     }`;
  } else if (authData.secType == env.OAUTH2) {
    cloneQuery = `
      ${env.PREFIXES}
      INSERT {
        GRAPH ?g {
          ${sparqlEscapeUri(remoteDataObjectUri)}
            dgftSec:targetAuthenticationConfiguration
              ${sparqlEscapeUri(newAuthConf)} .
          ${sparqlEscapeUri(newAuthConf)}
            dgftSec:secrets
              ${sparqlEscapeUri(newCreds)} .
          ${sparqlEscapeUri(newCreds)} dgftOauth:clientId ?clientId ;
            dgftOauth:clientSecret ?clientSecret .
          ${sparqlEscapeUri(newAuthConf)}
            dgftSec:securityConfiguration ${sparqlEscapeUri(newConf)} .
          ${sparqlEscapeUri(newConf)}
            ?srcConfP ?srcConfO .
        }
      }
      WHERE {
        GRAPH ?g {
          ${sparqlEscapeUri(authData.authenticationConfiguration)}
            dgftSec:securityConfiguration ?srcConfg.
          ?srcConfg ?srcConfP ?srcConfO.

          ${sparqlEscapeUri(authData.authenticationConfiguration)}
            dgftSec:secrets ?srcSecrets.
          ?srcSecrets  dgftOauth:clientId ?clientId ;
            dgftOauth:clientSecret ?clientSecret .
        }
     }`;
  }
  else {
    throw `Unsupported Security type ${authData.secType}`;
  }

  await update(cloneQuery);

  return { newAuthConf, newConf, newCreds };
}
