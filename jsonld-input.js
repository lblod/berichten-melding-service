import { uuid } from 'mu';
import { messageRegistrationContext } from './Contexts';
import * as N3 from 'n3';
const { namedNode } = N3.DataFactory;

/*
 * This method ensures some basic things on the root node of the request body
 * e.g the root node should have a URI (@id), context (@context) and a type.
 * it also adds a uuid for internal processing, since it's used for constructing the URI if necessary
 * TODO: implementation this needs revision:
 *  it defies the purpose of jsonLd; if vendor provides own context, this breaks
 */
export async function enrichBodyForRegister(originalBody) {

  if (!originalBody['@context']) {
    originalBody['@context'] = messageRegistrationContext;
  }
  if (!originalBody['@type']) {
    // Note: we don't store the submission; it will just trigger a job
    originalBody['@type'] = 'meb:Submission';
  }
  const id = uuid();
  originalBody['http://mu.semte.ch/vocabularies/core/uuid'] = id;

  if (!originalBody['@id']) {
    originalBody['@id'] = `http://data.lblod.info/job/id/${id}`;
  }
  if (originalBody.authentication) {
    originalBody.authentication[
      '@id'
    ] = `http://data.lblod.info/authentications/${uuid()}`;
    originalBody.authentication.configuration[
      '@id'
    ] = `http://data.lblod.info/configurations/${uuid()}`;
    originalBody.authentication.credentials[
      '@id'
    ] = `http://data.lblod.info/credentials/${uuid()}`;
  }

  return originalBody;
}

export function extractInfoFromTriplesForRegister(store) {
  const locationHrefs = store.getObjects(
    undefined,
    namedNode('http://www.w3.org/ns/prov#atLocation'),
  );
  const submittedResources = store.getObjects(
    undefined,
    namedNode('http://purl.org/dc/terms/subject'),
  );
  const authenticationConfigurations = store.getObjects(
    undefined,
    namedNode(
      'http://lblod.data.gift/vocabularies/security/targetAuthenticationConfiguration',
    ),
  );
  const secrets = store.getObjects(
    undefined,
    namedNode(
      'http://lblod.data.gift/vocabularies/security/secrets',
    ),
  );
  const securityConfigs = store.getObjects(
    undefined,
    namedNode(
      'http://lblod.data.gift/vocabularies/security/securityConfiguration',
    ),
  );

  return {
    href: locationHrefs[0]?.value,
    submittedResource: submittedResources[0]?.value,
    authenticationConfiguration: authenticationConfigurations[0]?.value,
    secret: secrets[0]?.value,
    securityConfig: securityConfigs[0]?.value,
  };
}

export function extractAuthentication(store) {
  const keys = store.getObjects(
    undefined,
    namedNode('http://mu.semte.ch/vocabularies/account/key'),
  );
  const vendors = store.getObjects(
    undefined,
    namedNode('http://purl.org/pav/providedBy'),
  );
  const organisations = store.getObjects(
    undefined,
    namedNode('http://purl.org/pav/createdBy'),
  );
  return {
    key: keys[0]?.value,
    vendor: vendors[0]?.value,
    organisation: organisations[0]?.value,
  };
}

export function validateExtractedInfo() {
  const errors = [];
  console.warn(`TODO: validation function called but is a void function`);
  return { isValid: errors.length === 0, errors };
}
