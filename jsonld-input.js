import { uuid } from 'mu';
import * as env from './env';
import { NAMESPACES as ns } from './env';
import { MessageRegistrationContext } from './Contexts';
import * as N3 from 'n3';
const { namedNode } = N3.DataFactory;

/*
 * This method ensures some basic things on the root node of the request body
 * e.g the root node should have a URI (@id), context (@context) and a type. it
 * also adds a uuid for internal processing, since it's used for constructing
 * the URI if necessary
 */
export async function enrichBodyForRegister(originalBody) {
  if (!originalBody['@context'])
    originalBody['@context'] = MessageRegistrationContext;
  if (!originalBody.type) originalBody.type = 'schema:Conversation';

  //const id = uuid();
  //originalBody['core:uuid'] = id;
  //if (!originalBody.id) originalBody.id = `berichten:${id}`;

  if (typeof originalBody?.message === 'string')
    originalBody.message = {
      id: originalBody.message,
      type: 'schema:Message',
    };
  else if (!originalBody?.message?.type)
    originalBody.message.type = 'schema:Message';

  if (originalBody.authentication) {
    originalBody.authentication.id = `auths:${uuid()}`;
    originalBody.authentication.configuration.id = `confs:${uuid()}`;
    originalBody.authentication.credentials.id = `creds:${uuid()}`;
  }
  return originalBody;
}

export function extractInfoFromTriplesForRegister(store) {
  const hrefs = store.getObjects(undefined, ns.prov`atLocation`);
  const conversations = store.getObjects(
    undefined,
    ns.rdf`type`,
    ns.sch`Conversation`,
  );
  const messages = store.getObjects(undefined, ns.sch`hasPart`);
  const authenticationConfigurations = store.getObjects(
    undefined,
    ns.dgftSec`targetAuthenticationConfiguration`,
  );
  const organizations = store.getObjects(undefined, ns.pav`authoredBy`);
  const vendors = store.getObjects(undefined, ns.pav`contributedBy`);
  const keys = store.getObjects(vendors[0], ns.muAccount`key`);
  return {
    conversation: conversations[0]?.value,
    message: messages[0]?.value,
    href: hrefs[0]?.value,
    authenticationConfiguration: authenticationConfigurations[0]?.value,
    organization: organizations[0]?.value,
    publisher: vendors[0]?.value,
    key: keys[0]?.value,
  };
}

export function extractAuthentication(store) {
  const keys = store.getObjects(undefined, ns.muAccount`key`);
  const vendors = store.getObjects(undefined, ns.pav`providedBy`);
  const organisations = store.getObjects(undefined, ns.pav`createdBy`);
  return {
    key: keys[0]?.value,
    vendor: vendors[0]?.value,
    organisation: organisations[0]?.value,
  };
}

//export function validateExtractedInfo(extracted) {
//  const { status } = extracted;
//  const errors = [];
//  if (/*something wrong*/)
//    errors.push({ message: 'Property <name> is not valid.' });
//
//  return { isValid: errors.length === 0, errors };
//}
