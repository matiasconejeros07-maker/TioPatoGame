// Solo existe en la demo: atajos para probar el juego completo sin jugar cientos de partidas.
export class DemoController {
  constructor({ api, wallet, audio }) { this.api = api; this.wallet = wallet; this.audio = audio; }
  async addCoins(amount) { this.wallet.balance = (await this.api.request('POST', '/demo/coins', { amount })).balance; this.audio.play('coin'); }
}
