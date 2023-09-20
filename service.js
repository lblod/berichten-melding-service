import * as mas from '@lblod/mu-auth-sudo';
import * as mu from 'mu';
import * as env from './env';
import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import {
  uuid,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  sparqlEscapeUri,
} from 'mu';

export async function exists(resource, orgGraph) {
  const result = await mas.querySudo(`
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

      SELECT (COUNT(*) as ?count)
      WHERE {
        GRAPH ${mu.sparqlEscapeUri(orgGraph)} {
          ${mu.sparqlEscapeUri(resource)} a ?type .
        }
      }
    `);
  return parseInt(result.results.bindings[0].count.value) > 0;
}

async function cleanCredentials(authenticationConfigurationUri) {
  let cleanQuery = `
    ${env.PREFIXES}
    DELETE {
      GRAPH ?g {
        ?srcSecrets ?secretsP ?secretsO.
      }
    }
    WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(authenticationConfigurationUri)}
          dgftSec:secrets ?srcSecrets.
        ?srcSecrets
          ?secretsP ?secretsO.
     }
   }`;
  await update(cleanQuery);
}

export async function verifyKeyAndOrganisation(vendor, key, organisation) {
  const result = await mas.querySudo(`
    ${env.PREFIXES}
    SELECT DISTINCT ?organisationID WHERE  {
      GRAPH <http://mu.semte.ch/graphs/automatic-submission> {
        ${mu.sparqlEscapeUri(vendor)}
          a foaf:Agent;
          muAccount:key ${mu.sparqlEscapeString(key)};
          muAccount:canActOnBehalfOf ${mu.sparqlEscapeUri(organisation)}.
      }
      ${mu.sparqlEscapeUri(organisation)}
        mu:uuid ?organisationID.
    }`);
  if (result.results.bindings.length === 1) {
    return result.results.bindings[0].organisationID.value;
  }
  return null;
}
