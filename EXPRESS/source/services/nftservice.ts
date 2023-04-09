import { Network, Alchemy, Nft, AssetTransfersCategory } from "alchemy-sdk";
import * as dotenv from "dotenv";
import express from "express";
import axios, { AxiosResponse, HttpStatusCode } from "axios";
import queryenum from "../enum/querry";
import { id } from "ethers";
dotenv.config();
const settings = {
  apiKey: process.env.ALCHEMY_KEY,
  network: Network.ETH_MAINNET,
};
const alchemy = new Alchemy(settings);

const { Client } = require("pg");
const client = new Client();
client.connect((err: { stack: any }) => {
  if (err) {
    console.error("connection error", err.stack);
  } else {
    console.log("connected");
  }
});

let nftContract: String | undefined
async function getNftOwnerList(){
  
 nftContract = process.env.NFT_CONTRACT
  let res = await (await alchemy.nft.getOwnersForContract(String(process.env.NFT_CONTRACT))).owners
  return res
}

async function getRanking(dateForm:any,dateto:any){
  let res = await client.query(queryenum.GET_HATCH_RANKING,[dateForm, dateto])
  return res.rows
}


async function getWalletRank(dateForm:any,dateto:any,wallet:any){
  let res = await client.query(queryenum.GET_HATCH_WALLET_RANKING,[dateForm, dateto,wallet])
  return res.rows
}

async function getHatched(dateForm:any,dateto:any,wallet:any){
  let res = await client.query(queryenum.GET_HATCHED,[wallet,dateForm, dateto])
  return res.rows
}


async function getHatchedEggsId(){
  let res = await client.query("select id from nftdata")
  return res.rows
}
async function synchDatabase() {
  let arr: any[]= []
  let pageKey = undefined;
  let data;
  const address = [String(process.env.NFT_CONTRACT)];
  do {
    data = await alchemy.core.getAssetTransfers({
      fromBlock: "0x0",
      contractAddresses: address,
      fromAddress:"0x0000000000000000000000000000000000000000",
      category: [AssetTransfersCategory.ERC721],
      excludeZeroValue: true,
      pageKey:pageKey,
      withMetadata:true
    });
    pageKey = data.pageKey;
    arr.push.apply(arr,data.transfers)
  } while (pageKey != undefined);
  let idArray = await getHatchedEggsId()
  let newidArray = idArray
  .map((obj: { id: any; }) => obj.id)
  .filter((value: undefined) => {
    return value !== undefined;
  });
  arr = arr.filter(ob=>!newidArray.includes(Number(ob.tokenId)))
  console.log(arr.length)
  for (let i = 0; i < arr.length; i++) {
    await client.query(
      queryenum.INSERT_EGG_HATCHERS,
      [Number(arr[i].tokenId),arr[i].to,new Date(arr[i].metadata.blockTimestamp),arr[i].hash],
      (error: any, response:any) => {
        if (error) {
          throw error;
          console.log(error);
        }
      }
    );
  }
}





async function synchTraitDatabase(){
const axios = require('axios');
const response = await axios.get(`https://api.traitsniper.com/v1/collections/${String(process.env.NFT_CONTRACT)}/traits`, {
  params: {
    'include_prices': 'true'
  },
  headers: {
    'accept': 'application/json',
    'x-ts-api-key': '656325fd-6b80-40dc-8bbb-761d2397d172'
  }
});
let data = response.data.traits
for(let i = 0 ; i<data.length;i++){ 
  await client.query(
    queryenum.UPDATE_TRAIT_DATA,
    [data[i].floor_price,data[i].trait_id],
    (error: any, response:any) => {
      if (error) {
        throw error;
        console.log(error);
      }
    }
  );
}
}

let page = 1;
let totalpage;
async function synchNFTDataBase(){
  console.log("syncstart")
  let data: any[]= []
do{
  const response = await axios.get(`https://api.traitsniper.com/v1/collections/${String(process.env.NFT_CONTRACT)}/nfts`, {
    params: {
      'page': page,
      'limit': '200'
    },
    headers: {
      'accept': 'application/json',
      'x-ts-api-key': `${String(process.env.TRAITSNIPER_API)}`
    }
  });
  data.push.apply(data,response.data.nfts)
  totalpage = response.data.total_page
  console.log(page)
  page++
  await new Promise(resolve => setTimeout(resolve, 13000));
}
while(page <= totalpage)

let idArray = await getHatchedEggsId()
let newidArray = idArray
.map((obj: { id: any; }) => obj.id)
.filter((value: undefined) => {
  return value !== undefined;
});
data = data.filter(ob=>!newidArray.includes(Number(ob.token_id)))
console.log(data.length)
  for(let i = 0;i<data.length;i++){
    await client.query(
      queryenum.INSERT_WALLETS,
      [data[i].owner],
      (error: any, response:any) => {
        if (error) {
          throw error;
          console.log(error);
        }
      }
    );
    await client.query(
      queryenum.INSERT_NFT_OWNERS,
      [data[i].id,data[i].owner],
      (error: any, response:any) => {
        if (error) {
          throw error;
          console.log(error);
        }
      }
    );
    await client.query(
      queryenum.UPDATE_NFT_DATA,
      [data[i].id,data[i].name,data[i].image,data[i].rarity_score,data[i].token_id],
      (error: any, response:any) => {
        if (error) {
          throw error;
          console.log(error);
        }
      }
    );
    for(let j =0;j<data[i].traits.length;j++){
      await client.query(
        queryenum.INSERT_TRAIT_DATA,
        [data[i].traits[j].trait_id,data[i].traits[j].name,data[i].traits[j].value,0,data[i].traits[j].score],
        (error: any, response:any) => {
          if (error) {
            throw error;
            console.log(error);
          }
        }
      );
      await client.query(
        queryenum.INESRT_NFT_TRAITS,
        [data[i].traits[j].trait_id,data[i].id],
        (error: any, response:any) => {
          if (error) {
            throw error;
            console.log(error);
          }
        }
      );
    }
    
  }
  synchTraitDatabase()
}



async function getTraits(){
  let res = await client.query(queryenum.SELECT_TRAITS)
  return res.rows
} 

async function returnFiltered(body:any) {
  let letQuerryBody = `SELECT distinct n.id ,n.nftid,convert_from( cast(n.imgurl as bytea),'UTF8'),n.rarity 
  FROM nfttraits t1
  join nftdata n ON n.nftid = t1.nftid 
  join traits tr on t1.traitid = tr.traitid`
  let marker = 2;
  let arr = Object.values(body.data) as any
  for(let i =0; i< arr.length;i++){
    letQuerryBody += ` JOIN nfttraits t${marker} ON t${marker-1}.nftid = t${marker}.nftid`
    marker++
  }
  letQuerryBody += " where "
  marker=2;
  for (let i = 0; i < arr.length; i++) {
    letQuerryBody += "(";
    arr[i].forEach((element: any, index: number) => {
      letQuerryBody += `t${marker - 1}.traitid = '${element}'`;
      if (index < arr[i].length - 1) {
        letQuerryBody += " or ";
      }
    });
    letQuerryBody += ")";
    if (i < arr.length - 1) {
      letQuerryBody += " and ";
    }
    marker++;
  }
  let res = await client.query(letQuerryBody)
  return res.rows
}

// WHERE t1.traitid = '9798087'
//       AND (t2.traitid = '9797943' OR t2.traitid = '9797924') and (t3.traitid ='9797961')

export default {returnFiltered,
   synchDatabase,getRanking,getWalletRank,getHatched,getNftOwnerList,synchTraitDatabase,synchNFTDataBase,getTraits};
