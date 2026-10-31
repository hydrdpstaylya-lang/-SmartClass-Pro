import test from 'node:test';import assert from 'node:assert/strict';
import handler from './handler.mjs';import {status} from './ai.mjs';
function fakeReqRes(route,method='GET'){
 const req={url:'/?route='+encodeURIComponent(route),method,headers:{host:'localhost'}};
 const res={headers:{},setHeader(k,v){this.headers[k]=v},end(value){this.payload=value},statusCode:200};return{req,res}
}
test('health JSON responds without any external API configuration',async()=>{const{req,res}=fakeReqRes('health');await handler(req,res);assert.equal(res.statusCode,200);const data=JSON.parse(res.payload);assert.equal(data.ok,true);assert.equal(typeof data.ai,'boolean')});
test('unknown API returns 404',async()=>{const{req,res}=fakeReqRes('not-real');await handler(req,res);assert.equal(res.statusCode,404)});
test('school rooms are explicitly marked unsupported',async()=>{const{req,res}=fakeReqRes('rooms');await handler(req,res);assert.equal(res.statusCode,501)});
