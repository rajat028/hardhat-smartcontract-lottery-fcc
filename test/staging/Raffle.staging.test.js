const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const {developmentChains, networkConfig} = require("../../helper-hardhat-config")

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", function () {
          let raffle, raffleEntranceFee, raffleInterval, networkDeployer
          const chainId = network.config.chainId

          beforeEach(async function () {
              networkDeployer = (await getNamedAccounts()).deployer
              raffle = await ethers.getContract("Raffle", networkDeployer)
              raffleEntranceFee = await raffle.getEntranceFee()
              raffleInterval = await raffle.getInterval()
          })

          describe("fullfill random words", function () {
              it("works with live Chainlink keepers and chainlink VRF, we get a random winner", async () => {
                const starttingTimeStamp = await raffle.getLatestTimeStamp();
                const accounts = await ethers.getSigners()

                await new Promise(async (resolve, reject) => {
                    raffle.once("WinnerPicked", async() => {
                        try {
                            const recentWinner = await raffle.getRecentWinner()
                            const raffleState = await raffle.getRaffleState()
                            const winnerEndingbalance = await accounts[0].getBalance()
                            const endTimeStamp = await raffle.getLatestTimeStamp()

                            await expect(raffle.getPlayer(0)).to.be.reverted
                            assert.equal(raffleState, 0)
                            assert.equal(recentWinner.toString(), accounts[0].address)
                            assert.equal(
                                winnerEndingbalance.toString(),
                                winnerStartingBalance.add(raffleEntranceFee).toString()
                            )
                            assert(endTimeStamp > starttingTimeStamp)
                            resolve()
                        } catch (error) {
                            console.log(error)
                            reject(error)
                        }
                    })
                    console.log("Entering Raffle...")
                      const tx = await raffle.enterRaffle({ value: raffleEntranceFee })
                      await tx.wait(1)
                      console.log("Ok, time to wait...")
                    const winnerStartingBalance = await accounts[0].getBalance()
                })
              })
          })
      })