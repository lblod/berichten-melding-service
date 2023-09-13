//import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
//import {
//  uuid,
//  sparqlEscapeString,
//  sparqlEscapeDateTime,
//  sparqlEscapeUri,
//} from 'mu';
//import * as env from './env';
////import * as jobsAndTasks from './jobAndTaskManagement';
//import * as N3 from 'n3';
//const { namedNode } = N3.DataFactory;
//
//async function storeToTurtle(store) {
//  const vendors = store.getObjects(
//    undefined,
//    namedNode('http://purl.org/pav/providedBy'),
//  );
//  const vendor = vendors[0];
//  const storeCopy = new N3.Store();
//  storeCopy.addQuads([...store]);
//  const toRemove = storeCopy.getQuads(vendor);
//  storeCopy.removeQuads(toRemove);
//  const writer = new N3.Writer({ format: 'application/n-quads' });
//  storeCopy.forEach((quad) => writer.addQuad(quad));
//  const ttl = await new Promise((resolve, reject) => {
//    writer.end((error, result) => {
//      if (error) reject(error);
//      else resolve(result);
//    });
//  });
//  return ttl;
//}
//
//async function attachClonedAuthenticationConfiguraton(
//  remoteDataObjectUri,
//  submissionUri,
//  submissionGraph,
//) {
//  const getInfoQuery = `
//    ${env.PREFIXES}
//    SELECT DISTINCT ?graph ?secType ?authenticationConfiguration WHERE {
//      GRAPH ${sparqlEscapeUri(submissionGraph)} {
//        ${sparqlEscapeUri(submissionUri)}
//          dgftSec:targetAuthenticationConfiguration
//            ?authenticationConfiguration.
//        ?authenticationConfiguration
//          dgftSec:securityConfiguration/rdf:type ?secType .
//      }
//    }
//  `;
//
//  const authData = parseResult(await query(getInfoQuery))[0];
//  const newAuthConf = `http://data.lblod.info/authentications/${uuid()}`;
//  const newConf = `http://data.lblod.info/configurations/${uuid()}`;
//  const newCreds = `http://data.lblod.info/credentials/${uuid()}`;
//
//  let cloneQuery = '';
//
//  if (!authData) {
//    return;
//  } else if (authData.secType === env.BASIC_AUTH) {
//    cloneQuery = `
//      ${env.PREFIXES}
//      INSERT {
//        GRAPH ${sparqlEscapeUri(submissionGraph)} {
//          ${sparqlEscapeUri(remoteDataObjectUri)}
//            dgftSec:targetAuthenticationConfiguration
//              ${sparqlEscapeUri(newAuthConf)} .
//          ${sparqlEscapeUri(newAuthConf)}
//            dgftSec:secrets ${sparqlEscapeUri(newCreds)} .
//          ${sparqlEscapeUri(newCreds)} meb:username ?user ;
//            muAccount:password ?pass .
//          ${sparqlEscapeUri(newAuthConf)}
//            dgftSec:securityConfiguration ${sparqlEscapeUri(newConf)} .
//          ${sparqlEscapeUri(newConf)}
//            ?srcConfP ?srcConfO .
//        }
//      }
//      WHERE {
//        GRAPH ${sparqlEscapeUri(submissionGraph)} {
//          ${sparqlEscapeUri(authData.authenticationConfiguration)}
//            dgftSec:securityConfiguration ?srcConfg.
//          ?srcConfg ?srcConfP ?srcConfO.
//
//          ${sparqlEscapeUri(authData.authenticationConfiguration)}
//            dgftSec:secrets ?srcSecrets.
//          ?srcSecrets  meb:username ?user ;
//            muAccount:password ?pass .
//        }
//     }`;
//  } else if (authData.secType == env.OAUTH2) {
//    cloneQuery = `
//      ${env.PREFIXES}
//      INSERT {
//        GRAPH ${sparqlEscapeUri(submissionGraph)} {
//          ${sparqlEscapeUri(remoteDataObjectUri)}
//            dgftSec:targetAuthenticationConfiguration
//              ${sparqlEscapeUri(newAuthConf)} .
//          ${sparqlEscapeUri(newAuthConf)}
//            dgftSec:secrets
//              ${sparqlEscapeUri(newCreds)} .
//          ${sparqlEscapeUri(newCreds)} dgftOauth:clientId ?clientId ;
//            dgftOauth:clientSecret ?clientSecret .
//          ${sparqlEscapeUri(newAuthConf)}
//            dgftSec:securityConfiguration ${sparqlEscapeUri(newConf)} .
//          ${sparqlEscapeUri(newConf)}
//            ?srcConfP ?srcConfO .
//        }
//      }
//      WHERE {
//        GRAPH ${sparqlEscapeUri(submissionGraph)} {
//          ${sparqlEscapeUri(authData.authenticationConfiguration)}
//            dgftSec:securityConfiguration ?srcConfg.
//          ?srcConfg ?srcConfP ?srcConfO.
//
//          ${sparqlEscapeUri(authData.authenticationConfiguration)}
//            dgftSec:secrets ?srcSecrets.
//          ?srcSecrets  dgftOauth:clientId ?clientId ;
//            dgftOauth:clientSecret ?clientSecret .
//        }
//     }`;
//  } else {
//    throw `Unsupported Security type ${authData.secType}`;
//  }
//
//  await update(cloneQuery);
//
//  return { newAuthConf, newConf, newCreds };
//}
//
//async function cleanCredentials(authenticationConfigurationUri) {
//  let cleanQuery = `
//    ${env.PREFIXES}
//    DELETE {
//      GRAPH ?g {
//        ?srcSecrets ?secretsP ?secretsO.
//      }
//    }
//    WHERE {
//      GRAPH ?g {
//        ${sparqlEscapeUri(authenticationConfigurationUri)}
//          dgftSec:secrets ?srcSecrets.
//        ?srcSecrets
//          ?secretsP ?secretsO.
//     }
//   }`;
//  await update(cleanQuery);
//}
//
//export async function verifyKeyAndOrganisation(vendor, key, organisation) {
//  const result = await query(`
//    ${env.PREFIXES}
//    SELECT DISTINCT ?organisationID WHERE  {
//      GRAPH <http://mu.semte.ch/graphs/automatic-submission> {
//        ${sparqlEscapeUri(vendor)}
//          a foaf:Agent;
//          muAccount:key ${sparqlEscapeString(key)};
//          muAccount:canActOnBehalfOf ${sparqlEscapeUri(organisation)}.
//      }
//      ${sparqlEscapeUri(organisation)}
//        mu:uuid ?organisationID.
//    }`);
//  if (result.results.bindings.length === 1) {
//    return result.results.bindings[0].organisationID.value;
//  }
//}
//
//export function cleanseRequestBody(body) {
//  const cleansed = body;
//  if (cleansed?.authentication) delete cleansed.authentication;
//  if (cleansed?.publisher?.key) delete cleansed.publisher.key;
//  return cleansed;
//}
//
//export async function sendErrorAlert({ message, detail, reference }) {
//  if (!message) throw 'Error needs a message describing what went wrong.';
//  const id = uuid();
//  const uri = `http://data.lblod.info/errors/${id}`;
//  const referenceTriple = reference
//    ? `${sparqlEscapeUri(uri)}
//         dct:references ${sparqlEscapeUri(reference)} .`
//    : '';
//  const detailTriple = detail
//    ? `${sparqlEscapeUri(uri)}
//         oslc:largePreview ${sparqlEscapeString(detail)} .`
//    : '';
//  const q = `
//    PREFIX mu:   <http://mu.semte.ch/vocabularies/core/>
//    PREFIX oslc: <http://open-services.net/ns/core#>      
//    PREFIX dct:  <http://purl.org/dc/terms/>
//    PREFIX xsd:  <http://www.w3.org/2001/XMLSchema#>
//    
//    INSERT DATA {
//      GRAPH <http://mu.semte.ch/graphs/error> {
//        ${sparqlEscapeUri(uri)}
//          a oslc:Error ;
//          mu:uuid ${sparqlEscapeString(id)} ;
//          dct:subject ${sparqlEscapeString('Automatic Submission Service')} ;
//          oslc:message ${sparqlEscapeString(message)} ;
//          dct:created ${sparqlEscapeDateTime(new Date().toISOString())} ;
//          dct:creator ${sparqlEscapeUri(env.CREATOR)} .
//        ${referenceTriple}
//        ${detailTriple}
//      }
//    }`;
//  try {
//    await update(q);
//    return uri;
//  } catch (e) {
//    console.warn(
//      `[WARN] Something went wrong while trying to store an error.\nMessage: ${e}\nQuery: ${q}`,
//    );
//  }
//}
