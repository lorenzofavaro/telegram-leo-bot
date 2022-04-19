from telethon.sync import TelegramClient
from telethon import Button
import requests
import json
import re
import random
import os
import sys
import html

with open('data/config.json') as f:
    config = json.load(f)

bot = TelegramClient('bot', config['clientId'], config['clientHash']).start(bot_token=config['botToken2'])

API_URLS = config['revApiUrls']
CHANNEL_CHAT_ID = config['channelChatId']
EMOJIS = ['🚀', '⭐', '💣', '💡', '🎉', '🎁', '💎']


def revProducts():
    catalogue = dict()

    try:
        session = requests.Session()
        response = session.get(API_URLS[0])
        response = json.loads(response.content)

        for product in response['products']:
            id = str(product[1])
            catalogue[id] = dict()

            catalogue[id]['img_url'] = product[0] if not product[0].startswith("photos/") else API_URLS[2] + product[0]
            catalogue[id]['name'] = product[2]
            catalogue[id]['link'] = product[3]
            catalogue[id]['available'] = int(product[7])
            catalogue[id]['notes'] = product[9] if product[9] != None else ''
    except:
        pass

    return catalogue


def starsProducts():
    catalogue = dict()

    try:
        session = requests.Session()
        response = session.get(API_URLS[1])
        response = json.loads(response.content)

        for id, args in response.items():
            catalogue[id] = dict()
            catalogue[id]['img_url'] = args['img']
            catalogue[id]['name'] = args['name']
            catalogue[id]['link'] = args['link']
            catalogue[id]['available'] = args['available']
            catalogue[id]['notes'] = args['notes'] if len(args['notes']) > 1 != None else ''
    except:
        pass

    return catalogue


def getProducts():
    products = {}

    products.update(revProducts())
    products.update(starsProducts())

    return products


def getRandomInteger(min, max):
    return random.randint(min, max)


def isProductAvailable(product):
    return product and product['name'] and product['available'] > 0


async def publishProduct(product, asin):
    text = createMessage(product, asin)
    if asin[0] != '0':
        buttons = [
            [Button.url('🎁 Test ⭐', f'{config["testUrl"]}={asin}-{config["buyerId"]}'), Button.url('❗ Guide ❗', config["guideUrl"])],
            [Button.url('🛒 Catalogue 🛒', config['catalogueUrl']), Button.url('👥 Support 👥', config['botUrl'])]]
    else:
        buttons = [[Button.url('Test product!', f'{config["testUrl2"]}={asin}')]]

    async with bot:
        try:
            await bot.send_file(CHANNEL_CHAT_ID, product['img_url'], caption=text, buttons=buttons)
        except:
            pass


def createMessage(product, id):
    text = "**Product:** "
    try:
        text += html.unescape(product['name']).capitalize()
    except:
        text += product['name'].capitalize()

    text += "\n**Code:** " + \
        str(id) + " 🌟" + ("\n**Notes:** " +
                          product['notes'] if product['notes'] else '')

    return text


async def publishNews(newProducts):
    if(os.path.isfile('data/catalogue.json') and os.stat('data/catalogue.json').st_size > 0):
        with open("data/catalogue.json", "r") as myFile:
            oldProducts = json.load(myFile)
            toPublish = []

            for asin in newProducts:
                product = newProducts[asin]
                if isProductAvailable(product) and asin.split('-')[0] not in toPublish and (asin not in oldProducts or oldProducts[asin]['available'] < 1):
                    toPublish.append(asin.split('-')[0])
                    await publishProduct(product, asin)

    with open("data/catalogue.json", "w") as myFile:
        json.dump(newProducts, myFile, indent=4)


def removeCatalogue():
    if (os.path.isfile("data/catalogue.json")):
        os.remove("data/catalogue.json")


async def main():
    mode = sys.argv[1]

    if mode == 'remove_catalogue':
        removeCatalogue()
    else:
        await publishNews(getProducts())

with bot:
    bot.loop.run_until_complete(main())
