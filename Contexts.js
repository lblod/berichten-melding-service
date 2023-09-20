export const messageRegistrationContext = {
  prov: 'http://www.w3.org/ns/prov#',
  dct: 'http://purl.org/dc/terms/',
  muAccount: 'http://mu.semte.ch/vocabularies/account/',
  dgftOauth: 'http://kanselarij.vo.data.gift/vocabularies/oauth-2.0-session/',
  dgftSec: 'http://lblod.data.gift/vocabularies/security/',
  meb: 'http://rdf.myexperiment.org/ontologies/base/',
  pav: 'http://purl.org/pav/',
  adms: 'http://www.w3.org/ns/adms#',
  wotSec: 'https://www.w3.org/2019/wot/security#',
  organization: {
    '@id': 'pav:createdBy',
    '@type': '@id',
  },
  href: {
    '@type': '@id',
    '@id': 'prov:atLocation',
  },
  submittedResource: {
    '@type': '@id',
    '@id': 'dct:subject',
  },
  key: 'muAccount:key',
  publisher: 'pav:providedBy',
  uri: {
    '@type': '@id',
    '@id': '@id',
  },
  status: {
    '@type': '@id',
    '@id': 'adms:status',
  },
  authentication: 'dgftSec:targetAuthenticationConfiguration',
  configuration: 'dgftSec:securityConfiguration',
  credentials: 'dgftSec:secrets',
  acceptedBy: 'dgftSec:acceptedBy',
  oauth2: {
    '@type': '@id',
    '@id': 'wotSec:OAuth2SecurityScheme',
  },
  basic: {
    '@type': '@id',
    '@id': 'wotSec:BasicSecurityScheme',
  },
  flow: 'wotSec:flow',
  token: 'wotSec:token',
  scheme: {
    '@id': '@type',
    '@type': '@vocab',
  },
  resource: 'dgftOauth:resource',
  clientId: 'dgftOauth:clientId',
  clientSecret: 'dgftOauth:clientSecret',
  username: 'meb:username',
  password: 'muAccount:password',
  submission: {
    '@type': '@id',
    '@id': 'dct:subject',
  },
  core: 'http://mu.semte.ch/vocabularies/core/',
  schema: 'http://schema.org/',
  berichten: 'http://data.lblod.info/id/berichten/',
  conversaties: 'http://data.lblod.info/id/conversaties/',
  auths: 'http://data.lblod.info/authentications/',
  confs: 'http://data.lblod.info/configurations/',
  creds: 'http://data.lblod.info/id/conversaties/',
  task: 'http://redpencil.data.gift/vocabularies/tasks/',
  cogs: 'http://vocab.deri.ie/cogs#',
  type: '@type',
  id: '@id',
  operation: {
    "@type": "@id",
    "@id": "task:operation"
  },
  creator: {
    "@type": "@id",
    "@id": "dct:creator"
  },
  created: {
    "@type": "http://www.w3.org/2001/XMLSchema#dateTime",
    "@id": "dct:created"
  },
  modified: {
    "@type": "http://www.w3.org/2001/XMLSchema#dateTime",
    "@id": "dct:modified"
  },
  message: {
    '@type': '@id',
    '@id': 'schema:hasPart',
  },
};
