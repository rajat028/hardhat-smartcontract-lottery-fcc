const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const {developmentChains, networkConfig} = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", function () {
        let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, raffleInterval
        const chainId = network.config.chainId

        beforeEach(async function() {
            deployer = (await getNamedAccounts()).deployer
            await deployments.fixture(["all"]);
            raffle = await ethers.getContract("Raffle", deployer)
            vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
            raffleEntranceFee = await raffle.getEntranceFee()
            raffleInterval = await raffle.getInterval();
        })

        describe("constructor", function() {
            it("Initialize raffle constructor", async function () {
                const raffleState = await raffle.getRaffleState();
                const interval = await raffle.getInterval();
                const gasLane = await raffle.getGasLane();
                assert(raffleState.toString(), "0")
                assert(interval, networkConfig[chainId]["interval"])
                assert(gasLane, networkConfig[chainId]["gasLane"])
                // TODO verify more assert cases.
            })
        })

        describe("Enter Raffle", function() {
            it("should revert when not having enough eth", async function() {
                await expect(raffle.enterRaffle()).to.be.revertedWith(
                    "Raffle__NotEnoughETHEntered"
                )
            })

            it("should enter raffle and add player", async function() {
                await raffle.enterRaffle({ value: raffleEntranceFee})
                const playerFromContract = await raffle.getPlayer(0)
                assert.equal(playerFromContract, deployer)
            })

            it("emit event on enter raffle", async function () {
                await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                    raffle,
                    "RaffleEnter"
                )
            })

            it("doesn't allow to enter raffle when calculating", async() => {
                await raffle.enterRaffle({value: raffleEntranceFee})
                await network.provider.send("evm_increaseTime", [raffleInterval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                await raffle.performUpkeep([])
                await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.revertedWith(
                    "Raffle__NotOpen"
                )
            })
        })

        describe("CheckUpKeep", function() {
            it("returns false if people haven't sent any ETH", async() => {
                await network.provider.send("evm_increaseTime", [raffleInterval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]) 
                assert.equal(upkeepNeeded, false)
            })
            it("return false if raffle state is not Open", async() => {
                await raffle.enterRaffle({value: raffleEntranceFee})
                await network.provider.send("evm_increaseTime", [raffleInterval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                await raffle.performUpkeep([])

                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                const raffleState = await raffle.getRaffleState()

                assert(raffleState.toString(), "1")
                console.log(`upkeepNeeded ${upkeepNeeded}`)
                assert.equal(upkeepNeeded, false)
            })
            // TODO Write other cases here
        })

        describe("PerformUpKeep", function() {
            it("should execute only when checkUpkeep returns true", async () => {
                // Given
                await raffle.enterRaffle({value: raffleEntranceFee})
                await network.provider.send("evm_increaseTime", [raffleInterval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                
                // When
                const result = await raffle.performUpkeep([])
                // this verfies function runs without any error
                assert(result)
            })

            it("emit event when performUpkeep executes sucessfully", async () => {
                // Given
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [raffleInterval.toNumber() + 1])
                await network.provider.send("evm_mine", [])

                const txResponse = await raffle.performUpkeep([])
                const txReceipt = await txResponse.wait(1)
                const requestId = txReceipt.events[1].args.requestId
                const raffleState = await raffle.getRaffleState()
                assert(requestId.toNumber() > 0)
                assert.equal(raffleState.toString(), "1")
            })

            it("should return Raffle_UpKeepNotNeeded when checkUpkeep returns false", async() => {
                await expect(raffle.performUpkeep([])).to.be.revertedWith("Raffle_UpKeepNotNeeded")
            })
        })

        describe("fullfillRandomWords", function () {
            beforeEach(async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [raffleInterval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
            })

            it("can only be called after performUpkeep", async () => {
                await expect(
                    vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
                ).to.be.revertedWith("nonexistent request")
            })

            it("picks a winner, resets, and sends money", async () => {
                const additionalEntrances = 3 // to test
                const startingIndex = 1
                const accounts = await ethers.getSigners()
                for (let i = startingIndex; i < startingIndex + additionalEntrances; i++) {
                    // i = 2; i < 5; i=i+1
                    const raffleConnected = await raffle.connect(accounts[i])
                    raffleConnected.enterRaffle({ value: raffleEntranceFee })
                }
                const startingTimeStamp = await raffle.getLatestTimeStamp() // stores starting timestamp (before we fire our event)

                // This will be more important for our staging tests...
                await new Promise(async (resolve, reject) => {
                    raffle.once("WinnerPicked", async () => {
                        console.log("WinnerPicked event fired!")
                        try {
                            const recentWinner = await raffle.getRecentWinner()
                            const raffleState = await raffle.getRaffleState()
                            const winnerBalance = await accounts[2].getBalance()
                            const endingTimeStamp = await raffle.getLastTimeStamp()
                            assert.equal(recentWinner.toString(), accounts[2].address)
                            assert.equal(raffleState, 0)
                            assert.equal(
                                winnerBalance.toString(),
                                startingBalance // startingBalance + ( (raffleEntranceFee * additionalEntrances) + raffleEntranceFee )
                                    .add(
                                        raffleEntranceFee
                                            .mul(additionalEntrances)
                                            .add(raffleEntranceFee)
                                    )
                                    .toString()
                            )
                            assert(endingTimeStamp > startingTimeStamp)
                            resolve() // if try passes, resolves the promise
                        } catch (e) {
                            reject(e) // if try fails, rejects the promise
                        }
                    })

                    // kicking off the event by mocking the chainlink keepers and vrf coordinator
                    const tx = await raffle.performUpkeep("0x")
                    const txReceipt = await tx.wait(1)
                    const startingBalance = await accounts[2].getBalance()
                    await vrfCoordinatorV2Mock.fulfillRandomWords(
                        txReceipt.events[1].args.requestId,
                        raffle.address
                    )
                })
            })
        })
    })